import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { DevicesService } from '../src/devices/devices.service';
import { ActuatorsService, ACTUATOR_LIMIT, ACTUATOR_REQUEST_LIMIT, ACTUATOR_HISTORY_LIMIT } from '../src/actuators/actuators.service';
import { MAX_CAPABILITY_ID } from '../src/actuators/actuators.dto';
import { TestActuator } from '../src/actuators/actuators.types';

const page = { limit: 20, offset: 0 };
async function fixture() {
  const f = await zoneFixture();
  const zone = f.zones.create(f.owner.id, f.input);
  const devices = f.app.get(DevicesService);
  const deviceInput = { zone_id: zone.id, station_id: 'ESP32-A', installed_at: '2026-10-06T00:00:00Z', cost: 0 };
  const device = devices.create(f.owner.id, deviceInput);
  const actuatorInput = { device_id: device.id, name: 'Van tưới', purpose: 'watering' as const, capability_id: 6 };
  return { ...f, zone, devices, device, deviceInput, actuatorInput, actuators: f.app.get(ActuatorsService) };
}

test('Actuators HTTP validates numeric hardware IDs, enum purpose and immutable fields', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http('actuators')).status, 401);
    for (const change of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: null },
      { purpose: 'Pump' }, { purpose: 'Shared' }, { purpose: null }, { capability_id: '6' }, { capability_id: null },
      { capability_id: 0 }, { capability_id: -1 }, { capability_id: 1.5 }, { capability_id: MAX_CAPABILITY_ID + 1 },
      { device_id: f.device.station_id }, { device_id: null }, { status: 'Offline' }, { status: 'On' }, { status: null },
      { id: randomUUID() }, { actuator_type: 'Pump' }, { state: 1 }, { auth_token: 'x' }]) {
      assert.equal((await f.http('actuators', 'POST', { ...f.actuatorInput, ...change }, token)).status, 400, JSON.stringify(change));
    }
    const created = await f.http('actuators', 'POST', { ...f.actuatorInput, name: ' Van tưới ' }, token);
    assert.equal(created.status, 201);
    const actuator = await created.json() as TestActuator;
    assert.equal(actuator.name, 'Van tưới');
    assert.equal(actuator.status, 'Active');
    assert.equal(actuator.capability_id, 6);
    assert.notEqual(actuator.id, actuator.device_id);
    assert.deepEqual(Object.keys(actuator).sort(), ['id', 'device_id', 'name', 'purpose', 'capability_id', 'status'].sort());
    for (const patch of [{}, { name: actuator.name }, { name: null }, { status: null }, { status: 'Off' },
      { purpose: 'shared' }, { purpose: actuator.purpose }, { capability_id: 7 }, { device_id: randomUUID() },
      { id: randomUUID() }, { state: 0 }, { zone_id: f.zone.id }]) {
      assert.equal((await f.http(`actuators/${actuator.id}`, 'PATCH', patch, token)).status, 400, JSON.stringify(patch));
    }
    assert.equal((await f.http(`actuators/${actuator.id}`, 'DELETE', undefined, token)).status, 404);
    assert.equal((await f.http('actuators', 'POST', { ...f.actuatorInput, device_id: randomUUID() }, token)).status, 404);
    const swaggerResponse = await fetch(`${await f.app.getUrl()}/api/docs-json`);
    assert.equal(swaggerResponse.status, 200);
    const swagger = await swaggerResponse.json() as { components: { schemas: Record<string, { properties: Record<string, { enum?: string[] }> }> } };
    assert.deepEqual(swagger.components.schemas.CreateActuatorDto.properties.purpose.enum, ['watering', 'spraying', 'shared']);
    assert.equal(swagger.components.schemas.UpdateActuatorDto.properties.purpose, undefined);
  } finally { await f.app.close(); }
});

test('One shared pump and two valves have separate capabilities; dedicated pumps may share a purpose with their valves', async () => {
  const f = await fixture();
  try {
    const pump = f.actuators.create(f.owner.id, { ...f.actuatorInput, name: 'Bơm chung', purpose: 'shared', capability_id: 8 });
    const water = f.actuators.create(f.owner.id, f.actuatorInput);
    const spray = f.actuators.create(f.owner.id, { ...f.actuatorInput, name: 'Van phun', purpose: 'spraying', capability_id: 7 });
    assert.equal(new Set([pump.id, water.id, spray.id]).size, 3);
    assert.equal(f.actuators.list(f.owner.id, { ...page, purpose: 'shared' }).items[0].id, pump.id);
    assert.equal(f.actuators.list(f.owner.id, { ...page, purpose: 'watering' }).total, 1);
    assert.equal(f.actuators.list(f.owner.id, { ...page, purpose: 'spraying' }).total, 1);
    // Cấu hình tương lai có bơm riêng: purpose không unique, chỉ cặp Device/capability unique.
    const dedicated = f.actuators.create(f.owner.id, { ...f.actuatorInput, name: 'Bơm tưới riêng', capability_id: 9 });
    assert.equal(dedicated.purpose, water.purpose);
    assert.equal(f.actuators.list(f.owner.id, { ...page, purpose: 'watering' }).total, 2);
    f.actuators.update(f.owner.id, pump.id, { status: 'Inactive' });
    f.actuators.update(f.owner.id, pump.id, { name: 'Bơm chung mới' });
    assert.equal(f.actuators.get(f.owner.id, pump.id).status, 'Inactive');
    assert.equal(f.actuators.get(f.owner.id, water.id).status, 'Active', 'Metadata status does not cascade or toggle valves');
    f.devices.update(f.owner.id, f.device.id, { status: 'Inactive' });
    assert.equal(f.actuators.get(f.owner.id, spray.id).status, 'Active');
    assert.equal(f.actuators.create(f.owner.id, { ...f.actuatorInput, capability_id: 10 }).status, 'Active');
    assert.throws(() => f.actuators.update(f.owner.id, pump.id, { purpose: 'watering' } as never), /Không sửa/);
    assert.equal(f.actuators.history(f.owner.id, pump.id, page).items[1].before!.purpose, 'shared');
    assert.equal(f.actuators.history(f.owner.id, pump.id, page).items[2].after.purpose, 'shared');
  } finally { await f.app.close(); }
});

test('Actuator composite uniqueness includes Inactive records and is checked again on Create approval', async () => {
  const f = await fixture();
  try {
    const other = f.devices.create(f.owner.id, { ...f.deviceInput, station_id: 'ESP32-B' });
    const proposal = f.actuators.createRequest(f.admin.id, f.actuatorInput);
    const a = f.actuators.create(f.owner.id, f.actuatorInput);
    const b = f.actuators.create(f.owner.id, { ...f.actuatorInput, device_id: other.id });
    assert.notEqual(a.id, b.id);
    assert.equal(f.actuators.getRecordByCapability(f.device.id, 6).id, a.id);
    assert.equal(f.actuators.getRecordByCapability(other.id, 6).id, b.id);
    assert.throws(() => f.actuators.approve(f.owner.id, proposal.id), /capability_id/);
    assert.equal(f.actuators.getRequest(f.owner.id, proposal.id).status, 'Pending');
    f.actuators.update(f.owner.id, a.id, { status: 'Inactive' });
    assert.throws(() => f.actuators.create(f.owner.id, f.actuatorInput), /capability_id/);
    assert.throws(() => f.actuators.createRequest(f.admin.id, f.actuatorInput), /capability_id/);
    assert.equal(f.actuators.getRecordByCapability(f.device.id, 6).status, 'Inactive');
    assert.throws(() => f.actuators.getRecordByCapability(f.device.station_id, 6), /Không tìm thấy/);
    const largest = f.actuators.create(f.owner.id, { ...f.actuatorInput, capability_id: MAX_CAPABILITY_ID });
    assert.equal(f.actuators.getRecordByCapability(f.device.id, MAX_CAPABILITY_ID).id, largest.id);
    assert.throws(() => f.actuators.create(f.owner.id, { ...f.actuatorInput, capability_id: MAX_CAPABILITY_ID + 1 }), /chính xác/);
  } finally { await f.app.close(); }
});

test('Actuator HTTP enforces owner writes, Admin-only proposals and current scoped reads', async () => {
  const f = await fixture();
  try {
    const actuator = f.actuators.create(f.owner.id, f.actuatorInput);
    const owner = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const worker = await f.login(f.worker.phone_number);
    const manager = await f.login(f.manager.phone_number);
    for (const token of [admin, worker, manager]) {
      assert.equal((await f.http('actuators', 'POST', { ...f.actuatorInput, capability_id: 7 }, token)).status, 403);
      assert.equal((await f.http(`actuators/${actuator.id}`, 'PATCH', { status: 'Inactive' }, token)).status, 403);
    }
    for (const token of [worker, manager]) {
      for (const path of [`actuators/${actuator.id}`, `actuators/${actuator.id}/history`, `actuators/by-capability/${f.device.id}/6`]) {
        assert.equal((await f.http(path, 'GET', undefined, token)).status, 404);
      }
      assert.equal((await f.http('actuators/requests', 'POST', { ...f.actuatorInput, capability_id: 7 }, token)).status, 403);
    }
    assert.equal((await f.http(`actuators/${actuator.id}`, 'GET', undefined, admin)).status, 200);
    assert.equal((await f.http(`actuators/${actuator.id}/update-requests`, 'POST', { purpose: 'shared' }, admin)).status, 400);
    const response = await f.http(`actuators/${actuator.id}/update-requests`, 'POST', { name: 'Van tưới mới' }, admin);
    assert.equal(response.status, 201);
    const request = await response.json() as { id: string };
    assert.equal(f.actuators.get(f.owner.id, actuator.id).name, f.actuatorInput.name);
    assert.equal((await f.http(`actuator-requests/${request.id}/approve`, 'PATCH', {}, admin)).status, 403);
    assert.equal((await f.http(`actuator-requests/${request.id}/approve`, 'PATCH', { status: 'Inactive' }, owner)).status, 400);
    assert.equal((await f.http(`actuator-requests/${request.id}/approve`, 'PATCH', {}, owner)).status, 200);
    assert.equal(f.actuators.get(f.owner.id, actuator.id).name, 'Van tưới mới');
    f.owner.status = 'Locked';
    assert.throws(() => f.actuators.get(f.owner.id, actuator.id), /Active/);
    assert.throws(() => f.actuators.createRequest(f.admin.id, { ...f.actuatorInput, capability_id: 7 }), /Active/);
  } finally { await f.app.close(); }
});

test('Concurrent Actuator approvals only commit one capability pair and preserve audit/proposal consistency', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    const first = f.actuators.createRequest(f.admin.id, { ...f.actuatorInput, purpose: 'shared' });
    const duplicate = f.actuators.createRequest(f.admin.id, f.actuatorInput);
    assert.equal(f.actuators.list(f.owner.id, page).total, 0);
    assert.throws(() => f.actuators.getRecordByCapability(f.device.id, 6), /Không tìm thấy/);
    const responses = await Promise.all([f.http(`actuator-requests/${first.id}/approve`, 'PATCH', {}, token),
      f.http(`actuator-requests/${first.id}/approve`, 'PATCH', {}, token), f.http(`actuator-requests/${duplicate.id}/approve`, 'PATCH', {}, token)]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409, 409]);
    const proposals = [first, duplicate].map((p) => f.actuators.getRequest(f.owner.id, p.id));
    const accepted = proposals.find((p) => p.status === 'Accepted')!;
    const pending = proposals.find((p) => p.status === 'Pending')!;
    assert.equal(f.actuators.list(f.owner.id, page).total, 1);
    assert.equal(pending.actuator_id, null);
    const history = f.actuators.history(f.owner.id, accepted.actuator_id!, page);
    assert.equal(history.total, 1);
    assert.equal(history.items[0].proposed_by, f.admin.id);
    assert.equal(history.items[0].actor_id, f.owner.id);
    assert.equal(history.items[0].request_id, accepted.id);
    assert.equal(f.actuators.reject(f.owner.id, pending.id, 'Trùng capability').status, 'Rejected');
    assert.throws(() => f.actuators.approve(f.owner.id, accepted.id), /đã được xử lý/);
    assert.throws(() => f.actuators.getRequest(f.worker.id, pending.id), /Không tìm thấy/);
    assert.equal(f.actuators.listRequests(f.worker.id, page).total, 0);
  } finally { await f.app.close(); }
});

test('Actuator Update approvals recheck roles and version, keeping immutable purpose and isolated snapshots', async () => {
  const f = await fixture();
  try {
    const actuator = f.actuators.create(f.owner.id, { ...f.actuatorInput, purpose: 'shared' });
    const proposal = f.actuators.updateRequest(f.admin.id, actuator.id, { name: 'Admin proposal' });
    assert.throws(() => f.actuators.updateRequest(f.admin.id, actuator.id, { status: 'Inactive' }), /Pending/);
    assert.throws(() => f.actuators.approve(f.worker.id, proposal.id), /Chỉ chủ/);
    assert.throws(() => f.actuators.reject(f.admin.id, proposal.id), /Chỉ chủ/);
    f.actuators.update(f.owner.id, actuator.id, { status: 'Inactive' });
    assert.throws(() => f.actuators.approve(f.owner.id, proposal.id), /đã thay đổi/);
    assert.equal(f.actuators.getRequest(f.owner.id, proposal.id).status, 'Pending');
    assert.equal(f.actuators.get(f.owner.id, actuator.id).name, f.actuatorInput.name);
    f.actuators.reject(f.owner.id, proposal.id);
    const next = f.actuators.updateRequest(f.admin.id, actuator.id, { status: 'Active' });
    f.admin.role = 'Farmer';
    assert.throws(() => f.actuators.approve(f.owner.id, next.id), /không còn là Admin/);
    f.admin.role = 'Admin'; f.admin.status = 'Locked';
    assert.throws(() => f.actuators.approve(f.owner.id, next.id), /Active/);
    f.admin.status = 'Active'; f.owner.status = 'Locked';
    assert.throws(() => f.actuators.approve(f.owner.id, next.id), /Active/);
    f.owner.status = 'Active';
    const copy = f.actuators.getRequest(f.owner.id, next.id);
    copy.proposed_changes.status = 'Inactive';
    copy.actuator_snapshot!.purpose = 'watering';
    f.actuators.approve(f.owner.id, next.id);
    assert.equal(f.actuators.get(f.owner.id, actuator.id).status, 'Active');
    assert.equal(f.actuators.get(f.owner.id, actuator.id).purpose, 'shared');
    assert.deepEqual(f.actuators.history(f.owner.id, actuator.id, page).items.map((h) => h.version), [1, 2, 3]);
  } finally { await f.app.close(); }
});

test('Actuator read access follows live HTX membership and accepted assignment [start,end)', async (context) => {
  const f = await fixture();
  try {
    const actuator = f.actuators.create(f.owner.id, f.actuatorInput);
    f.join();
    assert.equal(f.actuators.get(f.manager.id, actuator.id).id, actuator.id);
    assert.throws(() => f.actuators.update(f.manager.id, actuator.id, { name: 'Changed' }), /Chỉ chủ/);
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.equal(f.actuators.list(f.manager.id, page).total, 0);
    const assignments = f.app.get(AssignmentsService);
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const invite = assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id, start_date: start, end_date: end });
    assert.throws(() => f.actuators.get(f.worker.id, actuator.id), /phạm vi/);
    const accepted = assignments.approve(f.worker.id, invite.id);
    const clock = context.mock.method(Date, 'now', () => Date.parse(start) - 1);
    assert.throws(() => f.actuators.get(f.worker.id, actuator.id), /phạm vi/);
    clock.mock.mockImplementation(() => Date.parse(start));
    assert.equal(f.actuators.getByCapability(f.worker.id, f.device.id, 6).id, actuator.id);
    assert.equal(f.actuators.history(f.worker.id, actuator.id, page).total, 1);
    assert.throws(() => f.actuators.update(f.worker.id, actuator.id, { name: 'Changed' }), /Chỉ chủ/);
    clock.mock.mockImplementation(() => Date.parse(end));
    assert.equal(f.actuators.list(f.worker.id, page).total, 0);
    assert.throws(() => f.actuators.history(f.worker.id, actuator.id, page), /phạm vi/);
    assert.equal(assignments.get(f.worker.id, accepted.assignment_id!).assignment.id, accepted.assignment_id);
  } finally { await f.app.close(); }
});

test('Actuator filters, numeric pair lookups and history are bounded and return deep copies', async () => {
  const f = await fixture();
  try {
    const actuator = f.actuators.create(f.owner.id, f.actuatorInput);
    f.actuators.create(f.owner.id, { ...f.actuatorInput, name: 'Bơm chung', purpose: 'shared', capability_id: 8, status: 'Inactive' });
    assert.equal(f.actuators.list(f.owner.id, { ...page, purpose: 'watering', device_id: f.device.id, q: 'TƯỚI', status: 'Active' }).total, 1);
    assert.equal(f.actuators.list(f.owner.id, { ...page, q: '8' }).total, 1);
    assert.equal(f.actuators.list(f.owner.id, { limit: 1, offset: 1 }).items[0].purpose, 'shared');
    const token = await f.login(f.owner.phone_number);
    for (const q of ['limit=0', 'limit=101', 'offset=-1', 'offset=100001', 'device_id=bad', 'purpose=Pump', 'status=On', 'capability_id=6', 'q=' + 'a'.repeat(101)]) {
      assert.equal((await f.http(`actuators?${q}`, 'GET', undefined, token)).status, 400, q);
    }
    assert.equal((await f.http(`actuators/by-capability/${f.device.id}/6`, 'GET', undefined, token)).status, 200);
    assert.equal((await f.http(`actuators/by-capability/${f.device.station_id}/6`, 'GET', undefined, token)).status, 400);
    for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', String(MAX_CAPABILITY_ID + 1)]) {
      assert.equal((await f.http(`actuators/by-capability/${f.device.id}/${value}`, 'GET', undefined, token)).status, 400, value);
    }
    assert.equal((await f.http(`actuators/by-capability/${f.device.id}/999`, 'GET', undefined, token)).status, 404);
    assert.equal((await f.http('actuators/bad', 'GET', undefined, token)).status, 400);
    f.actuators.getRecordByCapability(f.device.id, 6).purpose = 'shared';
    f.actuators.list(f.owner.id, page).items[0].name = 'MUTATION';
    f.actuators.history(f.owner.id, actuator.id, page).items[0].after.capability_id = 8;
    assert.equal(f.actuators.get(f.owner.id, actuator.id).name, f.actuatorInput.name);
    assert.equal(f.actuators.get(f.owner.id, actuator.id).purpose, 'watering');
    assert.equal(f.actuators.history(f.owner.id, actuator.id, page).items[0].after.capability_id, 6);
  } finally { await f.app.close(); }
});

test('Actuator store/proposal/history capacity failures are atomic and leave rejection available', async () => {
  const f = await fixture();
  try {
    const proposal = f.actuators.createRequest(f.admin.id, { ...f.actuatorInput, capability_id: MAX_CAPABILITY_ID });
    let actuator = f.actuators.create(f.owner.id, f.actuatorInput);
    for (let i = 1; i < ACTUATOR_LIMIT; i++) { actuator = f.actuators.create(f.owner.id, { ...f.actuatorInput, capability_id: 10 + i }); }
    assert.throws(() => f.actuators.approve(f.owner.id, proposal.id), /thiết bị chấp hành đã đầy/);
    assert.throws(() => f.actuators.getRecordByCapability(f.device.id, MAX_CAPABILITY_ID), /Không tìm thấy/);
    assert.equal(f.actuators.getRequest(f.owner.id, proposal.id).actuator_id, null);
    for (let i = 1; i < ACTUATOR_REQUEST_LIMIT; i++) {
      const pending = f.actuators.updateRequest(f.admin.id, actuator.id, { name: 'Proposal' });
      f.actuators.reject(f.owner.id, pending.id);
    }
    assert.throws(() => f.actuators.updateRequest(f.admin.id, actuator.id, { name: 'Overflow' }), /đề xuất thiết bị chấp hành đã đầy/);
    for (let i = ACTUATOR_LIMIT; i < ACTUATOR_HISTORY_LIMIT; i++) { f.actuators.update(f.owner.id, actuator.id, { name: `Revision-${i}` }); }
    const before = f.actuators.get(f.owner.id, actuator.id);
    assert.throws(() => f.actuators.update(f.owner.id, actuator.id, { status: 'Inactive' }), /lịch sử thiết bị chấp hành đã đầy/);
    assert.deepEqual(f.actuators.get(f.owner.id, actuator.id), before);
    assert.equal(f.actuators.getRecordByCapability(f.device.id, actuator.capability_id).id, actuator.id);
    assert.equal(f.actuators.reject(f.owner.id, proposal.id).status, 'Rejected');
  } finally { await f.app.close(); }
});
