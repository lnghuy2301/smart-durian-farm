import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { DevicesService, DEVICE_HISTORY_LIMIT, DEVICE_LIMIT } from '../src/devices/devices.service';
import { TestDevice } from '../src/devices/devices.types';
import { TreesService } from '../src/trees/trees.service';

const page = { limit: 20, offset: 0 };
const details = { station_id: 'DEMO_STATION', installed_at: '2026-10-06T08:00:00+07:00', cost: 1500000 };

async function fixture() {
  const f = await zoneFixture();
  const zone = f.zones.create(f.owner.id, f.input);
  return { ...f, zone, devices: f.app.get(DevicesService), trees: f.app.get(TreesService), inputDevice: { zone_id: zone.id, ...details } };
}

test('Devices HTTP validates hardware identity, installation fields and immutable identifiers', async () => {
  const f = await fixture();
  try {
    const owner = await f.login(f.owner.phone_number);
    assert.equal((await f.http('devices')).status, 401);
    for (const invalid of [{ station_id: '' }, { station_id: ' ' }, { station_id: 'x'.repeat(51) },
      { station_id: null }, { station_id: 'a/b' }, { station_id: '+' }, { station_id: '#' }, { station_id: ' DEMO_STATION' },
      { installed_at: '2026-02-30T00:00:00Z' }, { installed_at: '2026-10-06' }, { installed_at: '2026-10-06T08:00:00' },
      { installed_at: null }, { cost: -1 }, { cost: 100000000 }, { cost: 1.123 }, { cost: '100' }, { cost: null },
      { zone_id: 'bad' }, { zone_id: null }, { status: 'Online' }, { status: 'Offline' },
      { status: null }, { auth_token: 'not-implemented' }, { tree_ids: [] }, { device_id: randomUUID() }, { id: randomUUID() }]) {
      assert.equal((await f.http('devices', 'POST', { ...f.inputDevice, ...invalid }, owner)).status, 400, JSON.stringify(invalid));
    }
    const response = await f.http('devices', 'POST', f.inputDevice, owner);
    assert.equal(response.status, 201);
    const device = await response.json() as TestDevice;
    assert.match(device.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(device.id, device.station_id);
    assert.equal(device.station_id, details.station_id);
    assert.equal(device.installed_at, '2026-10-06T01:00:00.000Z');
    assert.equal(device.status, 'Active');
    assert.deepEqual(Object.keys(device).sort(), ['id', 'zone_id', 'station_id', 'installed_at', 'cost', 'status', 'last_seen_at'].sort());
    for (const patch of [{}, { cost: details.cost }, { station_id: 'OTHER' }, { zone_id: randomUUID() }, { id: randomUUID() },
      { cost: null }, { installed_at: null }, { status: null }, { auth_token: 'x' }]) {
      assert.equal((await f.http(`devices/${device.id}`, 'PATCH', patch, owner)).status, 400, JSON.stringify(patch));
    }
    assert.equal((await f.http(`devices/${device.id}`, 'PATCH', { status: 'Inactive' }, owner)).status, 200);
    assert.equal((await f.http(`devices/${device.id}`, 'PATCH', { cost: 0 }, owner)).status, 200);
    assert.equal(f.devices.get(f.owner.id, device.id).status, 'Inactive', 'Cost PATCH cannot restore installation status');
    assert.equal((await f.http(`devices/by-station/${details.station_id}`, 'GET', undefined, owner)).status, 200);
    assert.equal((await f.http(`devices/${device.id}`, 'DELETE', undefined, owner)).status, 404);
    assert.equal((await f.http('devices', 'POST', { ...f.inputDevice, station_id: 'NEW', zone_id: randomUUID() }, owner)).status, 404);
  } finally { await f.app.close(); }
});

test('Devices enforce owner writes, Admin proposals and scoped HTTP reads without device tokens', async () => {
  const f = await fixture();
  try {
    const device = f.devices.create(f.owner.id, f.inputDevice);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const worker = await f.login(f.worker.phone_number);
    const manager = await f.login(f.manager.phone_number);
    for (const token of [admin, worker, manager]) {
      assert.equal((await f.http('devices', 'POST', { ...f.inputDevice, station_id: 'NEW' }, token)).status, 403);
      assert.equal((await f.http(`devices/${device.id}`, 'PATCH', { status: 'Inactive' }, token)).status, 403);
    }
    for (const token of [worker, manager]) {
      for (const path of [`devices/${device.id}`, `devices/by-station/${device.station_id}`, `devices/${device.id}/history`, `devices/${device.id}/trees`]) {
        assert.equal((await f.http(path, 'GET', undefined, token)).status, 404);
      }
      assert.equal((await f.http('devices/requests', 'POST', { ...f.inputDevice, station_id: 'NEW' }, token)).status, 403);
    }
    assert.equal((await f.http(`devices/${device.id}`, 'GET', undefined, admin)).status, 200);
    f.owner.status = 'Locked';
    assert.throws(() => f.devices.get(f.owner.id, device.id), /Active/);
    assert.throws(() => f.devices.createRequest(f.admin.id, { ...f.inputDevice, station_id: 'NEW' }), /Active/);
  } finally { await f.app.close(); }
});

test('Station uniqueness is global, retained for Inactive devices and rechecked when approving creation', async () => {
  const f = await fixture();
  try {
    const secondZone = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Other' });
    const proposal = f.devices.createRequest(f.admin.id, f.inputDevice);
    assert.equal(f.devices.list(f.owner.id, page).total, 0);
    assert.throws(() => f.devices.getRecordByStationId(details.station_id), /Không tìm thấy/);
    const device = f.devices.create(f.owner.id, { ...f.inputDevice, zone_id: secondZone.id });
    assert.throws(() => f.devices.approve(f.owner.id, proposal.id), /station_id/);
    assert.equal(f.devices.getRequest(f.owner.id, proposal.id).status, 'Pending');
    f.devices.update(f.owner.id, device.id, { status: 'Inactive' });
    assert.throws(() => f.devices.create(f.owner.id, f.inputDevice), /station_id/);
    assert.throws(() => f.devices.createRequest(f.admin.id, f.inputDevice), /station_id/);
    assert.equal(f.devices.getRecordByStationId(details.station_id).id, device.id);
    assert.equal(f.devices.getRecordByStationId(details.station_id).zone_id, secondZone.id);
    assert.throws(() => f.devices.update(f.owner.id, device.id, { station_id: 'CHANGED' } as never), /Không sửa/);
    assert.throws(() => f.devices.getRecordByStationId(details.station_id.toLowerCase()), /Không tìm thấy/, 'Lookup preserves exact topic identity');
    const copy = f.devices.getRecordByStationId(details.station_id);
    copy.station_id = 'MUTATION';
    assert.equal(f.devices.getRecordByStationId(details.station_id).station_id, details.station_id);
  } finally { await f.app.close(); }
});

test('Concurrent Admin creation approvals commit once; duplicate stations never yield two registered devices', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    const first = f.devices.createRequest(f.admin.id, f.inputDevice);
    const duplicate = f.devices.createRequest(f.admin.id, f.inputDevice);
    const results = await Promise.all([f.http(`device-requests/${first.id}/approve`, 'PATCH', {}, token),
      f.http(`device-requests/${first.id}/approve`, 'PATCH', {}, token),
      f.http(`device-requests/${duplicate.id}/approve`, 'PATCH', {}, token)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    const proposals = [first, duplicate].map((p) => f.devices.getRequest(f.owner.id, p.id));
    const accepted = proposals.find((p) => p.status === 'Accepted')!;
    const remaining = proposals.find((p) => p.status === 'Pending')!;
    assert.equal(accepted.status, 'Accepted');
    assert.equal(f.devices.list(f.owner.id, page).total, 1);
    const history = f.devices.history(f.owner.id, accepted.device_id!, page);
    assert.equal(history.total, 1);
    assert.equal(history.items[0].actor_id, f.owner.id);
    assert.equal(history.items[0].proposed_by, f.admin.id);
    assert.equal(history.items[0].request_id, accepted.id);
    assert.equal(remaining.device_id, null);
    assert.equal(f.devices.reject(f.owner.id, remaining.id, 'Trạm trùng').status, 'Rejected');
    assert.equal(f.devices.listRequests(f.worker.id, page).total, 0);
    assert.throws(() => f.devices.getRequest(f.worker.id, first.id), /Không tìm thấy/);
    assert.throws(() => f.devices.reject(f.admin.id, accepted.id), /đã được xử lý/);
  } finally { await f.app.close(); }
});

test('Device update approval rechecks roles, reviewer and version; stale proposals cannot overwrite owner edits', async () => {
  const f = await fixture();
  try {
    const device = f.devices.create(f.owner.id, f.inputDevice);
    const proposal = f.devices.updateRequest(f.admin.id, device.id, { cost: 100 });
    assert.throws(() => f.devices.updateRequest(f.admin.id, device.id, { status: 'Inactive' }), /Pending/);
    assert.throws(() => f.devices.approve(f.worker.id, proposal.id), /Chỉ chủ/);
    assert.throws(() => f.devices.reject(f.admin.id, proposal.id), /Chỉ chủ/);
    f.devices.update(f.owner.id, device.id, { status: 'Inactive' });
    assert.throws(() => f.devices.approve(f.owner.id, proposal.id), /đã thay đổi/);
    assert.equal(f.devices.history(f.owner.id, device.id, page).total, 2);
    assert.equal(f.devices.get(f.owner.id, device.id).cost, details.cost);
    f.devices.reject(f.owner.id, proposal.id);
    const restore = f.devices.updateRequest(f.admin.id, device.id, { status: 'Active' });
    f.admin.status = 'Locked';
    assert.throws(() => f.devices.approve(f.owner.id, restore.id), /Active/);
    f.admin.status = 'Active';
    f.admin.role = 'Farmer';
    assert.throws(() => f.devices.approve(f.owner.id, restore.id), /không còn là Admin/);
    f.admin.role = 'Admin';
    f.owner.status = 'Locked';
    assert.throws(() => f.devices.approve(f.owner.id, restore.id), /Active/);
    f.owner.status = 'Active';
    const copy = f.devices.getRequest(f.owner.id, restore.id);
    copy.proposed_changes.status = 'Inactive';
    copy.device_snapshot!.station_id = 'MUTATED';
    f.devices.approve(f.owner.id, restore.id);
    assert.equal(f.devices.get(f.owner.id, device.id).status, 'Active');
    assert.equal(f.devices.get(f.owner.id, device.id).station_id, details.station_id);
    assert.deepEqual(f.devices.history(f.owner.id, device.id, page).items.map((h) => h.version), [1, 2, 3]);
  } finally { await f.app.close(); }
});

test('Devices share current HTX and accepted assignment intervals; expired Farmers keep only their assignment history', async (context) => {
  const f = await fixture();
  try {
    const device = f.devices.create(f.owner.id, f.inputDevice);
    f.join();
    assert.equal(f.devices.get(f.manager.id, device.id).id, device.id);
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.equal(f.devices.list(f.manager.id, page).total, 0);
    assert.throws(() => f.devices.get(f.manager.id, device.id), /phạm vi/);
    const assignments = f.app.get(AssignmentsService);
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const invite = assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id, start_date: start, end_date: end });
    assert.throws(() => f.devices.get(f.worker.id, device.id), /phạm vi/);
    const accepted = assignments.approve(f.worker.id, invite.id);
    const clock = context.mock.method(Date, 'now', () => Date.parse(start) - 1);
    assert.throws(() => f.devices.get(f.worker.id, device.id), /phạm vi/);
    clock.mock.mockImplementation(() => Date.parse(start));
    assert.equal(f.devices.getByStationId(f.worker.id, details.station_id).id, device.id);
    assert.equal(f.devices.history(f.worker.id, device.id, page).total, 1);
    assert.throws(() => f.devices.update(f.worker.id, device.id, { status: 'Inactive' }), /Chỉ chủ/);
    clock.mock.mockImplementation(() => Date.parse(end));
    assert.throws(() => f.devices.get(f.worker.id, device.id), /phạm vi/);
    assert.equal(f.devices.list(f.worker.id, page).total, 0);
    assert.equal(assignments.get(f.worker.id, accepted.assignment_id!).assignment.id, accepted.assignment_id);
  } finally { await f.app.close(); }
});

test('Every current tree in the shared Zone belongs to Device scope without per-tree foreign keys or snapshots', async () => {
  const f = await fixture();
  try {
    const device = f.devices.create(f.owner.id, f.inputDevice);
    const second = f.devices.create(f.owner.id, { ...f.inputDevice, station_id: 'SECOND' });
    const treeInput = { zone_id: f.zone.id, variety: 'Ri6', plant_date: '2024-05-01T08:00:00+07:00', longitude: 106, latitude: 10 };
    const a = f.trees.create(f.owner.id, treeInput);
    const b = f.trees.create(f.owner.id, { ...treeInput, status: 'Dead' });
    const otherZone = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Other' });
    f.trees.create(f.owner.id, { ...treeInput, zone_id: otherZone.id });
    assert.deepEqual(f.devices.affectedTrees(f.owner.id, device.id, page).items.map((t) => t.id), [a.id, b.id]);
    assert.equal(f.devices.affectedTrees(f.owner.id, second.id, page).total, 2);
    f.trees.create(f.owner.id, { ...treeInput, status: 'Removed' });
    f.devices.update(f.owner.id, device.id, { status: 'Inactive' });
    assert.equal(f.devices.affectedTrees(f.owner.id, device.id, page).total, 3);
    assert.ok(f.devices.affectedTrees(f.owner.id, device.id, page).items.every((t) => !('device_id' in t)));
    const token = await f.login(f.owner.phone_number);
    const response = await f.http(`devices/${device.id}/trees?limit=1&offset=1`, 'GET', undefined, token);
    assert.equal(response.status, 200);
    const result = await response.json() as { total: number; items: Array<{ id: string }> };
    assert.equal(result.total, 3);
    assert.deepEqual(result.items.map((t) => t.id), [b.id]);
    result.items[0].id = 'MUTATION';
    assert.equal(f.devices.affectedTrees(f.owner.id, device.id, page).items[1].id, b.id);
  } finally { await f.app.close(); }
});

test('Device filters, history and station query enforce bounds and return isolated copies', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    const a = f.devices.create(f.owner.id, f.inputDevice);
    f.devices.create(f.owner.id, { ...f.inputDevice, station_id: 'OTHER', status: 'Inactive' });
    assert.equal(f.devices.list(f.owner.id, { ...page, q: 'demo_', status: 'Active', zone_id: f.zone.id }).total, 1);
    assert.equal(f.devices.list(f.owner.id, { limit: 1, offset: 1 }).total, 2);
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=100001', 'status=Offline', 'zone_id=bad', 'q=' + 'a'.repeat(101), 'auth_token=x']) {
      assert.equal((await f.http(`devices?${query}`, 'GET', undefined, token)).status, 400, query);
    }
    assert.equal((await f.http('devices/not-a-uuid', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('devices/by-station/%23', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('devices/by-station/UNKNOWN', 'GET', undefined, token)).status, 404);
    a.cost = -1;
    const list = f.devices.list(f.owner.id, page);
    list.items[0].status = 'Inactive';
    const history = f.devices.history(f.owner.id, a.id, page);
    history.items[0].after.station_id = 'MUTATION';
    assert.equal(f.devices.get(f.owner.id, a.id).cost, details.cost);
    assert.equal(f.devices.get(f.owner.id, a.id).status, 'Active');
    assert.equal(f.devices.history(f.owner.id, a.id, page).items[0].after.station_id, details.station_id);
  } finally { await f.app.close(); }
});

test('Device capacity and full audit reject mutations atomically while allowing pending proposal rejection', async () => {
  const f = await fixture();
  try {
    const proposal = f.devices.createRequest(f.admin.id, { ...f.inputDevice, station_id: 'PROPOSAL' });
    let device = f.devices.create(f.owner.id, f.inputDevice);
    for (let i = 1; i < DEVICE_LIMIT; i++) {
      device = f.devices.create(f.owner.id, { ...f.inputDevice, station_id: `D-${i}` });
    }
    assert.throws(() => f.devices.approve(f.owner.id, proposal.id), /thiết bị đã đầy/);
    assert.throws(() => f.devices.getRecordByStationId('PROPOSAL'), /Không tìm thấy/);
    assert.equal(f.devices.getRequest(f.owner.id, proposal.id).device_id, null);
    const pending = f.devices.updateRequest(f.admin.id, device.id, { cost: 1 });
    for (let i = DEVICE_LIMIT; i < DEVICE_HISTORY_LIMIT; i++) {
      f.devices.update(f.owner.id, device.id, { cost: i });
    }
    const before = f.devices.get(f.owner.id, device.id);
    assert.throws(() => f.devices.update(f.owner.id, device.id, { status: 'Inactive' }), /lịch sử thiết bị đã đầy/);
    assert.deepEqual(f.devices.get(f.owner.id, device.id), before);
    assert.equal(f.devices.history(f.owner.id, device.id, { limit: 100, offset: 0 }).total, DEVICE_HISTORY_LIMIT - DEVICE_LIMIT + 1);
    assert.equal(f.devices.getRequest(f.owner.id, pending.id).status, 'Pending');
    assert.equal(f.devices.reject(f.owner.id, pending.id).status, 'Rejected');
  } finally { await f.app.close(); }
});
