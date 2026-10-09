import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { HttpException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { MqttTransport, TransportHandlers } from '../src/mqtt/mqtt.transport';
import { readMqttConfig } from '../src/mqtt/mqtt.config';
import { MqttService } from '../src/mqtt/mqtt.service';
import { DevicesService } from '../src/devices/devices.service';
import { SensorsService } from '../src/sensors/sensors.service';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { MockZoneAssignmentStore } from '../src/assignments/mock-zone-assignment.store';
import { TelemetryService } from '../src/telemetry/telemetry.service';
import { TELEMETRY_READING_LIMIT, TelemetryStore } from '../src/telemetry/telemetry.store';
import { TelemetryRecord } from '../src/telemetry/telemetry.types';

const page = { limit: 100, offset: 0 };
const topic = 'publish/station/DEMO_STATION';
const packet = (value: unknown) => Buffer.from(JSON.stringify(value));
const reading = (result = '26.54 C', dataStreamId = 301) => ({ dataStreamId, result });
class FakeTransport extends MqttTransport {
  handlers?: TransportHandlers;
  start(handlers: TransportHandlers): void {
    this.handlers = handlers;
    handlers.state({ enabled: true, connected: true, subscribed: true, last_error: null });
  }
  async stop(): Promise<void> { this.handlers = undefined; }
  async publish(): Promise<{ status: 'TransportAccepted' }> { return { status: 'TransportAccepted' }; }
  emit(records = [reading()], options: { topic?: string; retained?: boolean; extra?: object } = {}) {
    this.handlers!.message(options.topic ?? topic, packet({ sensorRecords: records, ...options.extra }), options.retained ?? false);
  }
}
async function fixture() {
  const transport = new FakeTransport();
  const f = await zoneFixture({ mqtt: { ...readMqttConfig({}), enabled: true, host: 'broker.invalid', port: 1883 }, transport });
  const zone = f.zones.create(f.owner.id, f.input);
  const devices = f.app.get(DevicesService);
  const device = devices.create(f.owner.id, { zone_id: zone.id, station_id: 'DEMO_STATION', installed_at: '2026-10-07T00:00:00Z', cost: 0 });
  const sensors = f.app.get(SensorsService);
  const sensor = sensors.create(f.owner.id, { device_id: device.id, name: 'Temperature', sensor_type: 'air_temperature', data_stream_id: '301', unit: 'C' });
  return { ...f, transport, zone, devices, device, sensors, sensor, service: f.app.get(TelemetryService),
    store: f.app.get(TelemetryStore), assignments: f.app.get(AssignmentsService), assignmentStore: f.app.get(MockZoneAssignmentStore) };
}
const status = (code: number) => (error: unknown) => error instanceof HttpException && error.getStatus() === code;
function at<T>(time: number, operation: () => T): T {
  const original = Date.now;
  Date.now = () => time;
  try { return operation(); } finally { Date.now = original; }
}

test('Telemetry MQTT->HTTP shares one store, keeps one document/reading, latest per stream and immutable raw units', async () => {
  const f = await fixture();
  try {
    f.sensors.create(f.owner.id, { device_id: f.device.id, name: 'Humidity', sensor_type: 'air_humidity', data_stream_id: '302', unit: '%' });
    f.transport.emit([reading('26.54 oC'), reading('70 %', 302)]);
    f.transport.emit([reading('26.54 oC')]); // Equal value is a new measurement, not a dedup key.
    const owner = await f.login(f.owner.phone_number);
    const response = await f.http('telemetry/devices/' + f.device.id + '/history', 'GET', undefined, owner);
    assert.equal(response.status, 200);
    const body = await response.json() as { items: TelemetryRecord[]; total: number };
    assert.equal(body.total, 3);
    assert.equal(new Set(body.items.map((item) => item._id)).size, 3);
    assert.ok(body.items.every((item) => ObjectId.isValid(item._id) && item.device_id === f.device.id));
    assert.deepEqual(Object.keys(body.items[0]).sort(), ['_id', 'device_id', 'data_stream_id', 'measured_at', 'received_at', 'value', 'unit'].sort());
    const latest = f.service.latest(f.owner.id, f.device.id, page);
    assert.equal(latest.total, 2);
    assert.equal(latest.items[0]._id, body.items[0]._id);
    assert.equal(latest.items[0].unit, 'oC');
    f.sensors.update(f.owner.id, f.sensor.id, { unit: '%rH' });
    assert.equal(f.service.history(f.owner.id, f.device.id, page).items[0].unit, 'oC');
    latest.items[0].unit = 'client-write';
    assert.equal(f.service.latest(f.owner.id, f.device.id, page).items[0].unit, 'oC');
  } finally { await f.app.close(); }
});

test('Telemetry uses UUID+stream identity and isolates the same numeric stream on different Devices', async () => {
  const f = await fixture();
  try {
    const other = f.devices.create(f.owner.id, { zone_id: f.zone.id, station_id: 'OTHER', installed_at: '2026-10-07T00:00:00Z', cost: 0 });
    f.sensors.create(f.owner.id, { device_id: other.id, name: 'Other temperature', sensor_type: 'air_temperature', data_stream_id: '301', unit: 'C' });
    f.transport.emit([reading('10 C')]);
    f.transport.emit([reading('20 C')], { topic: 'publish/station/OTHER' });
    assert.equal(f.service.latest(f.owner.id, f.device.id, page).items[0].value, 10);
    assert.equal(f.service.latest(f.owner.id, other.id, page).items[0].value, 20);
    assert.throws(() => f.service.history(f.owner.id, 'DEMO_STATION', page), status(404));
  } finally { await f.app.close(); }
});

test('Only accepted readings reach Telemetry; rejected packets/ACK/unknown/inactive metadata preserve old history', async () => {
  const f = await fixture();
  try {
    f.transport.emit([reading(), reading('2 C', 999)]);
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 1);
    f.transport.handlers!.message(topic, packet({ status: 'ACK' }), false);
    f.transport.handlers!.message(topic, packet({ status: 'OTHER' }), false);
    f.transport.emit(undefined, { retained: true });
    f.transport.emit(undefined, { extra: { stationId: 'OTHER' } });
    f.transport.emit(undefined, { topic: 'publish/station/UNREGISTERED' });
    f.transport.emit([reading(), reading('NaN %', 302)]); // Entire malformed packet rejects.
    for (const deviceStatus of ['Inactive', 'Maintenance'] as const) {
      f.devices.update(f.owner.id, f.device.id, { status: deviceStatus });
      f.transport.emit();
    }
    f.devices.update(f.owner.id, f.device.id, { status: 'Active' });
    f.sensors.update(f.owner.id, f.sensor.id, { status: 'Inactive' });
    f.transport.emit();
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 1);
  } finally { await f.app.close(); }
});

test('Backend packet-read time and store-write time are separate; hardware timestamp extras are ignored', async () => {
  const f = await fixture();
  const original = Date.now;
  try {
    const base = original();
    let calls = 0;
    Date.now = () => base + 5 * calls++;
    f.transport.emit(undefined, { extra: { measured_at: '1999-01-01T00:00:00Z', resultTime: '1999-01-01T00:00:00Z' } });
    Date.now = original;
    const record = f.service.history(f.owner.id, f.device.id, page).items[0];
    assert.equal(record.measured_at, new Date(base).toISOString());
    assert.ok(Date.parse(record.received_at) > Date.parse(record.measured_at));
    const diagnostic = f.app.get(MqttService).messages(f.owner.id, f.device.id, page).items[0];
    assert.equal(diagnostic.received_at, record.measured_at); // Diagnostics contract remains arrival time.
  } finally { Date.now = original; await f.app.close(); }
});

test('Telemetry history filters received_at [from,to), uses stable arrival order for ties and validates HTTP queries', async () => {
  const f = await fixture();
  try {
    const base = Date.now();
    for (let i = 0; i < 3; i++) { at(base + i * 1000, () => f.transport.emit([reading(i + ' C')])); }
    const query = { ...page, from: new Date(base).toISOString(), to: new Date(base + 2000).toISOString() };
    assert.deepEqual(f.service.history(f.owner.id, f.device.id, query).items.map((item) => item.value), [1, 0]);
    at(base + 3000, () => { f.transport.emit([reading('3 C')]); f.transport.emit([reading('4 C')]); });
    const one = f.service.history(f.owner.id, f.device.id, { limit: 1, offset: 1, data_stream_id: '301' });
    assert.equal(one.total, 5); assert.equal(one.items[0].value, 3);
    assert.equal(f.service.latest(f.owner.id, f.device.id, { ...page, data_stream_id: '302' }).total, 0);
    const token = await f.login(f.owner.phone_number);
    const route = 'telemetry/devices/' + f.device.id + '/history';
    for (const suffix of ['?limit=0', '?limit=101', '?offset=-1', '?offset=100001', '?from=bad', '?from=2026-02-30T00:00:00Z',
      '?from=2026-10-07', '?from=2026-10-07T00:00:00', '?from=2026-10-08T00:00:00Z&to=2026-10-07T00:00:00Z',
      '?from=2026-10-07T00:00:00Z&to=2026-10-07T00:00:00Z', '?data_stream_id=bad%2Fstream', '?station_id=OTHER']) {
      assert.equal((await f.http(route + suffix, 'GET', undefined, token)).status, 400, suffix);
    }
    assert.equal((await f.http('telemetry/devices/not-uuid/latest', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/latest?limit=1', 'GET', undefined, token)).status, 200);
  } finally { await f.app.close(); }
});

test('JWT, owner/Admin/Manager scopes apply to latest and history, without HTTP injection/mutation routes', async () => {
  const f = await fixture();
  try {
    const owner = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const manager = await f.login(f.manager.phone_number);
    const worker = await f.login(f.worker.phone_number);
    f.transport.emit();
    for (const path of ['latest', 'history']) {
      const route = 'telemetry/devices/' + f.device.id + '/' + path;
      assert.equal((await f.http(route)).status, 401);
      assert.equal((await f.http(route, 'GET', undefined, worker)).status, 404);
      assert.equal((await f.http(route, 'GET', undefined, manager)).status, 404);
      assert.equal((await f.http(route, 'GET', undefined, admin)).status, 200);
      assert.equal((await f.http('telemetry/devices/' + randomUUID() + '/' + path, 'GET', undefined, owner)).status, 404);
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        assert.equal((await f.http(route, method, { value: 99 }, owner)).status, 404);
      }
    }
    f.join();
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/history', 'GET', undefined, manager)).status, 200);
    const leave = f.farms.leaveRequest(f.owner.id, f.farm.id);
    f.farms.approve(f.admin.id, leave.id);
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/history', 'GET', undefined, manager)).status, 404);
    f.users.findById(f.owner.id)!.status = 'Locked';
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/latest', 'GET', undefined, owner)).status, 401);
  } finally { await f.app.close(); }
});

test('Pending invitations grant no Telemetry; accepted Farmer loses both APIs immediately on assignment end', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.worker.phone_number);
    const invite = f.assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id });
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/history', 'GET', undefined, token)).status, 404);
    const accepted = f.assignments.approve(f.worker.id, invite.id);
    f.transport.emit();
    assert.equal((await f.http('telemetry/devices/' + f.device.id + '/latest', 'GET', undefined, token)).status, 200);
    assert.equal(f.service.history(f.worker.id, f.device.id, page).total, 1);
    f.assignments.end(f.owner.id, accepted.assignment_id!);
    for (const path of ['latest', 'history']) {
      assert.equal((await f.http('telemetry/devices/' + f.device.id + '/' + path, 'GET', undefined, token)).status, 404);
    }
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 1);
  } finally { await f.app.close(); }
});

test('Farmer boundaries are [start,end); new assignments cannot expose readings from before current assignment', async () => {
  const f = await fixture();
  try {
    const now = Date.now(), start = now - 1000, end = now + 1000;
    f.assignmentStore.accept(f.worker.id, f.zone, new Date(start).toISOString(), new Date(end).toISOString(), new Date(start).toISOString());
    for (const time of [start - 1, start, end - 1, end]) { at(time, () => f.transport.emit()); }
    assert.equal(at(start, () => f.service.history(f.worker.id, f.device.id, page)).total, 2);
    assert.throws(() => at(end, () => f.service.history(f.worker.id, f.device.id, page)), status(404));
    assert.throws(() => at(start - 1, () => f.service.latest(f.worker.id, f.device.id, page)), status(404));
    const next = end + 1000;
    f.assignmentStore.accept(f.worker.id, f.zone, new Date(next).toISOString(), null, new Date(next).toISOString());
    assert.equal(at(next, () => f.service.latest(f.worker.id, f.device.id, page)).total, 0);
    at(next, () => f.transport.emit());
    assert.equal(at(next, () => f.service.history(f.worker.id, f.device.id, page)).total, 1);
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 5);
  } finally { await f.app.close(); }
});

test('FIFO caps at 10,000 globally across Devices, preserves insertion order despite clock changes and defensive copies', () => {
  const store = new TelemetryStore();
  const record = (i: number): TelemetryRecord => ({ _id: new ObjectId().toHexString(), device_id: i % 2 ? 'A' : 'B',
    data_stream_id: String(i % 3), measured_at: '2026-10-07T00:00:00Z', received_at: '2026-10-07T00:00:00Z', value: i, unit: 'C' });
  const input = Array.from({ length: TELEMETRY_READING_LIMIT + 2 }, (_, i) => record(i));
  store.append(input);
  const items = store.newestFirst();
  assert.equal(items.length, 10000);
  assert.equal(items[0].value, 10001); assert.equal(items.at(-1)!.value, 2);
  input.at(-1)!.unit = 'mutate input';
  items[0].value = -1;
  assert.equal(store.newestFirst()[0].value, 10001);
  assert.equal(store.newestFirst()[0].unit, 'C');
  const olderClock = { ...record(10002), received_at: '2020-01-01T00:00:00Z' };
  store.append([olderClock]);
  assert.equal(store.newestFirst()[0].value, 10002);
  assert.equal(store.newestFirst().at(-1)!.value, 3);
  assert.equal(new TelemetryStore().newestFirst().length, 0); // Restart/new process does not retain records.
});

test('Domain validates a batch before writing and latest never revives an evicted reading', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.service.record(f.device.id, [
      { dataStreamId: '301', value: 1, receivedUnit: 'C', rawResult: '1 C' },
      { dataStreamId: '999', value: 2, receivedUnit: 'C', rawResult: '2 C' },
    ], new Date().toISOString()), status(404));
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 0);
    f.transport.emit();
    const records = Array.from({ length: TELEMETRY_READING_LIMIT }, (_, i): TelemetryRecord => ({
      _id: new ObjectId().toHexString(), device_id: randomUUID(), data_stream_id: '301', measured_at: new Date().toISOString(),
      received_at: new Date().toISOString(), value: i, unit: 'C',
    }));
    f.store.append(records);
    assert.equal(f.service.latest(f.owner.id, f.device.id, page).total, 0);
    assert.equal(f.service.history(f.owner.id, f.device.id, page).total, 0);
  } finally { await f.app.close(); }
});
