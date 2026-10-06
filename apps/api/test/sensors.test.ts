import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { DevicesService } from '../src/devices/devices.service';
import { SensorsService, SENSOR_LIMIT, SENSOR_HISTORY_LIMIT, SENSOR_REQUEST_LIMIT } from '../src/sensors/sensors.service';
import { TestSensor } from '../src/sensors/sensors.types';

const page = { limit: 20, offset: 0 };
async function fixture() {
  const f = await zoneFixture();
  const zone = f.zones.create(f.owner.id, f.input);
  const devices = f.app.get(DevicesService);
  const device = devices.create(f.owner.id, { zone_id: zone.id, station_id: 'ESP32-A',
    installed_at: '2026-10-06T08:00:00+07:00', cost: 0 });
  const inputSensor = { device_id: device.id, name: 'Air sensor', sensor_type: 'Air_temperature' as const, unit: 'oC' as const, data_stream_id: '2' };
  return { ...f, zone, devices, device, inputSensor, sensors: f.app.get(SensorsService) };
}

test('Sensors HTTP validates enum choices, thresholds and immutable type/stream/Device identifiers', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http('sensors')).status, 401);
    for (const patch of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: null }, { unit: 'C' },
      { unit: '°C' }, { unit: 'F' }, { unit: null }, { sensor_type: 'Temperature' }, { sensor_type: null },
      { device_id: f.device.station_id }, { device_id: null }, { data_stream_id: 2 }, { data_stream_id: null },
      { data_stream_id: ' ' }, { data_stream_id: 'a/b' }, { data_stream_id: '#' }, { data_stream_id: '+' },
      { data_stream_id: 'x'.repeat(51) }, { status: 'Offline' }, { status: null }, { id: randomUUID() },
      { min_threshold: 1 }, { min_threshold: 1, max_threshold: 1 }, { min_threshold: 2, max_threshold: 1 },
      { min_threshold: 1.123, max_threshold: 2 }, { min_threshold: -100000, max_threshold: 2 },
      { min_threshold: 1, max_threshold: 100000 }, { min_threshold: '1', max_threshold: 2 }]) {
      assert.equal((await f.http('sensors', 'POST', { ...f.inputSensor, ...patch }, token)).status, 400, JSON.stringify(patch));
    }
    // Both enum units are valid for every immutable sensor_type; no type -> unit restriction.
    const response = await f.http('sensors', 'POST', { ...f.inputSensor, name: ' Air sensor ', unit: '%' }, token);
    assert.equal(response.status, 201);
    const sensor = await response.json() as TestSensor;
    assert.equal(sensor.name, 'Air sensor');
    assert.equal(sensor.unit, '%');
    assert.equal(sensor.min_threshold, null);
    assert.equal(sensor.max_threshold, null);
    assert.equal(sensor.status, 'Active');
    assert.deepEqual(Object.keys(sensor).sort(), ['id', 'device_id', 'name', 'sensor_type', 'unit', 'data_stream_id', 'min_threshold', 'max_threshold', 'status'].sort());
    for (const patch of [{}, { unit: '%' }, { unit: 'outside-enum' }, { unit: null }, { name: null }, { status: null },
      { sensor_type: 'Air_humidity' }, { sensor_type: sensor.sensor_type }, { device_id: randomUUID() },
      { data_stream_id: '3' }, { id: randomUUID() }, { zone_id: f.zone.id }]) {
      assert.equal((await f.http(`sensors/${sensor.id}`, 'PATCH', patch, token)).status, 400, JSON.stringify(patch));
    }
    assert.equal((await f.http(`sensors/${sensor.id}`, 'PATCH', { unit: 'oC' }, token)).status, 200);
    assert.equal((await f.http(`sensors/${sensor.id}`, 'DELETE', undefined, token)).status, 404);
    assert.equal((await f.http('sensors', 'POST', { ...f.inputSensor, device_id: randomUUID() }, token)).status, 404);
    const swaggerResponse = await fetch(`${await f.app.getUrl()}/api/docs-json`);
    assert.equal(swaggerResponse.status, 200);
    const swagger = await swaggerResponse.json() as { components: { schemas: Record<string, { properties: Record<string, { enum?: string[] }> }> } };
    assert.deepEqual(swagger.components.schemas.UpdateSensorDto.properties.unit.enum, ['%', 'oC']);
    assert.equal(swagger.components.schemas.UpdateSensorDto.properties.sensor_type, undefined);
  } finally { await f.app.close(); }
});

test('Sensor unit changes keep thresholds, immutable type and previous metadata snapshots unchanged', async () => {
  const f = await fixture();
  try {
    const sensor = f.sensors.create(f.owner.id, { ...f.inputSensor, min_threshold: -10, max_threshold: 40, status: 'Inactive' });
    const changed = f.sensors.update(f.owner.id, sensor.id, { unit: '%' });
    assert.equal(changed.sensor_type, 'Air_temperature');
    assert.equal(changed.status, 'Inactive');
    assert.equal(changed.min_threshold, -10);
    assert.equal(changed.max_threshold, 40);
    const history = f.sensors.history(f.owner.id, sensor.id, page);
    assert.equal(history.items[0].after.unit, 'oC');
    assert.equal(history.items[1].before!.unit, 'oC');
    assert.equal(history.items[1].after.unit, '%');
    assert.throws(() => f.sensors.update(f.owner.id, sensor.id, { min_threshold: 40 }), /ngưỡng/);
    assert.throws(() => f.sensors.update(f.owner.id, sensor.id, { max_threshold: null }), /ngưỡng/);
    assert.equal(f.sensors.history(f.owner.id, sensor.id, page).total, 2);
    assert.equal(f.sensors.update(f.owner.id, sensor.id, { max_threshold: 50 }).min_threshold, -10);
    assert.equal(f.sensors.update(f.owner.id, sensor.id, { min_threshold: null, max_threshold: null }).max_threshold, null);
    assert.throws(() => f.sensors.updateRequest(f.admin.id, sensor.id, { min_threshold: 1 }), /ngưỡng/);
    const pending = f.sensors.updateRequest(f.admin.id, sensor.id, { min_threshold: 1, max_threshold: 2, unit: 'oC' });
    f.sensors.approve(f.owner.id, pending.id);
    assert.equal(f.sensors.get(f.owner.id, sensor.id).max_threshold, 2);
    // The shared Device store is visible immediately; Device inactivity does not rewrite Sensor metadata.
    f.devices.update(f.owner.id, f.device.id, { status: 'Inactive' });
    assert.equal(f.sensors.get(f.owner.id, sensor.id).device_id, f.device.id);
    assert.equal(f.sensors.get(f.owner.id, sensor.id).status, 'Inactive');
    assert.equal(f.sensors.create(f.owner.id, { ...f.inputSensor, data_stream_id: '3', sensor_type: 'Air_humidity', unit: 'oC' }).unit, 'oC');
  } finally { await f.app.close(); }
});

test('Composite stream uniqueness is scoped to Device, exact and retained for Inactive sensors', async () => {
  const g = await fixture();
  try {
    const other = g.devices.create(g.owner.id, { zone_id: g.zone.id, station_id: 'ESP32-B', installed_at: '2026-10-06T00:00:00Z', cost: 0 });
    const a = g.sensors.create(g.owner.id, g.inputSensor);
    const b = g.sensors.create(g.owner.id, { ...g.inputSensor, device_id: other.id });
    assert.notEqual(a.id, b.id);
    assert.equal(g.sensors.getRecordByStream(g.device.id, '2').id, a.id);
    assert.equal(g.sensors.getRecordByStream(other.id, '2').id, b.id);
    g.sensors.update(g.owner.id, a.id, { status: 'Inactive' });
    assert.throws(() => g.sensors.create(g.owner.id, g.inputSensor), /data_stream_id/);
    assert.throws(() => g.sensors.createRequest(g.admin.id, g.inputSensor), /data_stream_id/);
    assert.equal(g.sensors.getRecordByStream(g.device.id, '2').status, 'Inactive');
    const upper = g.sensors.create(g.owner.id, { ...g.inputSensor, data_stream_id: 'ABC' });
    const lower = g.sensors.create(g.owner.id, { ...g.inputSensor, data_stream_id: 'abc' });
    assert.notEqual(upper.id, lower.id);
    assert.throws(() => g.sensors.getRecordByStream(g.device.station_id, '2'), /Không tìm thấy/);
    assert.throws(() => g.sensors.update(g.owner.id, a.id, { data_stream_id: 'NEW' } as never), /Không sửa/);
  } finally { await g.app.close(); }
});

test('Sensor HTTP rights match Devices: owner writes, Admin proposes, other Farmers/Managers read in scope only', async () => {
  const f = await fixture();
  try {
    const sensor = f.sensors.create(f.owner.id, f.inputSensor);
    const owner = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const worker = await f.login(f.worker.phone_number);
    const manager = await f.login(f.manager.phone_number);
    for (const token of [admin, worker, manager]) {
      assert.equal((await f.http('sensors', 'POST', { ...f.inputSensor, data_stream_id: 'NEW' }, token)).status, 403);
      assert.equal((await f.http(`sensors/${sensor.id}`, 'PATCH', { unit: '%' }, token)).status, 403);
    }
    for (const token of [worker, manager]) {
      for (const path of [`sensors/${sensor.id}`, `sensors/${sensor.id}/history`, `sensors/by-stream/${f.device.id}/2`]) {
        assert.equal((await f.http(path, 'GET', undefined, token)).status, 404);
      }
      assert.equal((await f.http('sensors/requests', 'POST', { ...f.inputSensor, data_stream_id: 'NEW' }, token)).status, 403);
    }
    assert.equal((await f.http(`sensors/${sensor.id}`, 'GET', undefined, admin)).status, 200);
    const response = await f.http(`sensors/${sensor.id}/update-requests`, 'POST', { unit: '%' }, admin);
    assert.equal(response.status, 201);
    const request = await response.json() as { id: string };
    assert.equal(f.sensors.get(f.owner.id, sensor.id).unit, 'oC');
    assert.equal((await f.http(`sensor-requests/${request.id}/approve`, 'PATCH', {}, admin)).status, 403);
    assert.equal((await f.http(`sensor-requests/${request.id}/approve`, 'PATCH', { unit: '%' }, owner)).status, 400);
    assert.equal((await f.http(`sensor-requests/${request.id}/approve`, 'PATCH', {}, owner)).status, 200);
    assert.equal(f.sensors.get(f.owner.id, sensor.id).unit, '%');
    f.owner.status = 'Locked';
    assert.throws(() => f.sensors.get(f.owner.id, sensor.id), /Active/);
    assert.throws(() => f.sensors.createRequest(f.admin.id, { ...f.inputSensor, data_stream_id: 'NEW' }), /Active/);
  } finally { await f.app.close(); }
});

test('Concurrent Sensor proposals only register one Device/stream pair and preserve pending duplicates', async () => {
  const f = await fixture();
  try {
    const owner = await f.login(f.owner.phone_number);
    const first = f.sensors.createRequest(f.admin.id, f.inputSensor);
    const duplicate = f.sensors.createRequest(f.admin.id, f.inputSensor);
    assert.equal(f.sensors.list(f.owner.id, page).total, 0);
    assert.throws(() => f.sensors.getRecordByStream(f.device.id, '2'), /Không tìm thấy/);
    const results = await Promise.all([f.http(`sensor-requests/${first.id}/approve`, 'PATCH', {}, owner),
      f.http(`sensor-requests/${first.id}/approve`, 'PATCH', {}, owner), f.http(`sensor-requests/${duplicate.id}/approve`, 'PATCH', {}, owner)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    assert.equal(f.sensors.list(f.owner.id, page).total, 1);
    const proposals = [first, duplicate].map((p) => f.sensors.getRequest(f.owner.id, p.id));
    const accepted = proposals.find((p) => p.status === 'Accepted')!;
    const pending = proposals.find((p) => p.status === 'Pending')!;
    assert.equal(pending.sensor_id, null);
    const history = f.sensors.history(f.owner.id, accepted.sensor_id!, page).items[0];
    assert.equal(history.proposed_by, f.admin.id);
    assert.equal(history.actor_id, f.owner.id);
    assert.equal(history.request_id, accepted.id);
    assert.equal(f.sensors.reject(f.owner.id, pending.id, 'Trùng stream').status, 'Rejected');
    assert.throws(() => f.sensors.approve(f.owner.id, accepted.id), /đã được xử lý/);
    assert.throws(() => f.sensors.getRequest(f.worker.id, pending.id), /Không tìm thấy/);
    assert.equal(f.sensors.listRequests(f.worker.id, page).total, 0);
  } finally { await f.app.close(); }
});

test('Sensor approvals recheck reviewer/proposer/version and cannot overwrite newer unit changes', async () => {
  const f = await fixture();
  try {
    const sensor = f.sensors.create(f.owner.id, f.inputSensor);
    const proposal = f.sensors.updateRequest(f.admin.id, sensor.id, { name: 'Admin proposal', unit: '%' });
    assert.throws(() => f.sensors.updateRequest(f.admin.id, sensor.id, { status: 'Inactive' }), /Pending/);
    assert.throws(() => f.sensors.approve(f.worker.id, proposal.id), /Chỉ chủ/);
    assert.throws(() => f.sensors.reject(f.admin.id, proposal.id), /Chỉ chủ/);
    f.sensors.update(f.owner.id, sensor.id, { unit: '%' });
    assert.throws(() => f.sensors.approve(f.owner.id, proposal.id), /đã thay đổi/);
    assert.equal(f.sensors.getRequest(f.owner.id, proposal.id).status, 'Pending');
    assert.equal(f.sensors.get(f.owner.id, sensor.id).name, f.inputSensor.name);
    f.sensors.reject(f.owner.id, proposal.id);
    const next = f.sensors.updateRequest(f.admin.id, sensor.id, { unit: 'oC' });
    f.admin.role = 'Farmer';
    assert.throws(() => f.sensors.approve(f.owner.id, next.id), /không còn là Admin/);
    f.admin.role = 'Admin'; f.admin.status = 'Locked';
    assert.throws(() => f.sensors.approve(f.owner.id, next.id), /Active/);
    f.admin.status = 'Active'; f.owner.status = 'Locked';
    assert.throws(() => f.sensors.approve(f.owner.id, next.id), /Active/);
    f.owner.status = 'Active';
    const copy = f.sensors.getRequest(f.owner.id, next.id);
    copy.proposed_changes.unit = '%';
    copy.sensor_snapshot!.data_stream_id = 'MUTATION';
    f.sensors.approve(f.owner.id, next.id);
    assert.equal(f.sensors.get(f.owner.id, sensor.id).unit, 'oC');
    assert.equal(f.sensors.get(f.owner.id, sensor.id).data_stream_id, '2');
    assert.deepEqual(f.sensors.history(f.owner.id, sensor.id, page).items.map((h) => h.version), [1, 2, 3]);
  } finally { await f.app.close(); }
});

test('Sensor reads track current HTX and accepted assignment [start,end), with no access after expiry', async (context) => {
  const f = await fixture();
  try {
    const sensor = f.sensors.create(f.owner.id, f.inputSensor);
    f.join();
    assert.equal(f.sensors.get(f.manager.id, sensor.id).id, sensor.id);
    assert.throws(() => f.sensors.update(f.manager.id, sensor.id, { unit: '%' }), /Chỉ chủ/);
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.equal(f.sensors.list(f.manager.id, page).total, 0);
    const assignments = f.app.get(AssignmentsService);
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const invite = assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id, start_date: start, end_date: end });
    assert.throws(() => f.sensors.get(f.worker.id, sensor.id), /phạm vi/);
    const accepted = assignments.approve(f.worker.id, invite.id);
    const clock = context.mock.method(Date, 'now', () => Date.parse(start) - 1);
    assert.throws(() => f.sensors.get(f.worker.id, sensor.id), /phạm vi/);
    clock.mock.mockImplementation(() => Date.parse(start));
    assert.equal(f.sensors.getByStream(f.worker.id, f.device.id, '2').id, sensor.id);
    assert.equal(f.sensors.history(f.worker.id, sensor.id, page).total, 1);
    assert.throws(() => f.sensors.update(f.worker.id, sensor.id, { unit: '%' }), /Chỉ chủ/);
    clock.mock.mockImplementation(() => Date.parse(end));
    assert.equal(f.sensors.list(f.worker.id, page).total, 0);
    assert.throws(() => f.sensors.history(f.worker.id, sensor.id, page), /phạm vi/);
    assert.equal(assignments.get(f.worker.id, accepted.assignment_id!).assignment.id, accepted.assignment_id);
  } finally { await f.app.close(); }
});

test('Sensor filtering, pair lookup and metadata history validate bounds and isolate returned copies', async () => {
  const f = await fixture();
  try {
    const sensor = f.sensors.create(f.owner.id, f.inputSensor);
    f.sensors.create(f.owner.id, { ...f.inputSensor, data_stream_id: 'SOIL', name: 'Soil', sensor_type: 'Soil_moisture', unit: '%', status: 'Inactive' });
    assert.equal(f.sensors.list(f.owner.id, { ...page, device_id: f.device.id, sensor_type: 'Air_temperature', q: 'AIR', status: 'Active' }).total, 1);
    assert.equal(f.sensors.list(f.owner.id, { limit: 1, offset: 1 }).items[0].data_stream_id, 'SOIL');
    const token = await f.login(f.owner.phone_number);
    for (const q of ['limit=0', 'limit=101', 'offset=-1', 'offset=100001', 'device_id=bad', 'sensor_type=bad', 'status=Online', 'unit=F', 'q=' + 'a'.repeat(101)]) {
      assert.equal((await f.http(`sensors?${q}`, 'GET', undefined, token)).status, 400, q);
    }
    assert.equal((await f.http(`sensors/by-stream/${f.device.id}/2`, 'GET', undefined, token)).status, 200);
    assert.equal((await f.http(`sensors/by-stream/${f.device.station_id}/2`, 'GET', undefined, token)).status, 400);
    assert.equal((await f.http(`sensors/by-stream/${f.device.id}/%23`, 'GET', undefined, token)).status, 400);
    assert.equal((await f.http(`sensors/by-stream/${f.device.id}/UNKNOWN`, 'GET', undefined, token)).status, 404);
    assert.equal((await f.http('sensors/bad', 'GET', undefined, token)).status, 400);
    const copy = f.sensors.getRecordByStream(f.device.id, '2');
    copy.unit = '%';
    f.sensors.list(f.owner.id, page).items[0].name = 'MUTATION';
    f.sensors.history(f.owner.id, sensor.id, page).items[0].after.unit = '%';
    assert.equal(f.sensors.get(f.owner.id, sensor.id).unit, 'oC');
    assert.equal(f.sensors.get(f.owner.id, sensor.id).name, f.inputSensor.name);
    assert.equal(f.sensors.history(f.owner.id, sensor.id, page).items[0].after.unit, 'oC');
  } finally { await f.app.close(); }
});

test('Sensor/store proposal/audit capacity failures leave records and indexes unchanged', async () => {
  const f = await fixture();
  try {
    const proposal = f.sensors.createRequest(f.admin.id, { ...f.inputSensor, data_stream_id: 'PROPOSAL' });
    let sensor = f.sensors.create(f.owner.id, f.inputSensor);
    for (let i = 1; i < SENSOR_LIMIT; i++) {
      sensor = f.sensors.create(f.owner.id, { ...f.inputSensor, data_stream_id: `S-${i}` });
    }
    assert.throws(() => f.sensors.approve(f.owner.id, proposal.id), /cảm biến đã đầy/);
    assert.throws(() => f.sensors.getRecordByStream(f.device.id, 'PROPOSAL'), /Không tìm thấy/);
    assert.equal(f.sensors.getRequest(f.owner.id, proposal.id).sensor_id, null);
    for (let i = 1; i < SENSOR_REQUEST_LIMIT; i++) {
      f.sensors.updateRequest(f.admin.id, sensor.id, { name: 'Proposal name' });
      f.sensors.reject(f.owner.id, f.sensors.listRequests(f.owner.id, { limit: 1, offset: i }).items[0].id);
    }
    assert.throws(() => f.sensors.updateRequest(f.admin.id, sensor.id, { name: 'Overflow' }), /đề xuất cảm biến đã đầy/);
    for (let i = SENSOR_LIMIT; i < SENSOR_HISTORY_LIMIT; i++) { f.sensors.update(f.owner.id, sensor.id, { name: `Revision-${i}` }); }
    const before = f.sensors.get(f.owner.id, sensor.id);
    assert.throws(() => f.sensors.update(f.owner.id, sensor.id, { unit: '%' }), /lịch sử cảm biến đã đầy/);
    assert.deepEqual(f.sensors.get(f.owner.id, sensor.id), before);
    assert.equal(f.sensors.getRecordByStream(f.device.id, sensor.data_stream_id).id, sensor.id);
    assert.equal(f.sensors.reject(f.owner.id, proposal.id).status, 'Rejected');
  } finally { await f.app.close(); }
});
