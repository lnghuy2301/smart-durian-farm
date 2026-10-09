import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { IClientOptions, MqttClient } from 'mqtt';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { readEnvironment } from '../src/config/environment';
import { MqttConfig, readMqttConfig } from '../src/mqtt/mqtt.config';
import { buildControlPublication, MQTT_MAX_PAYLOAD_BYTES, MQTT_RETURN_TOPIC, parseIncoming } from '../src/mqtt/mqtt.protocol';
import { BrokerState, MqttJsTransport, MqttTransport, TransportHandlers } from '../src/mqtt/mqtt.transport';
import { MQTT_DIAGNOSTIC_LIMIT, MqttService } from '../src/mqtt/mqtt.service';
import { DevicesService } from '../src/devices/devices.service';
import { SensorsService } from '../src/sensors/sensors.service';
import { ActuatorsService } from '../src/actuators/actuators.service';
import { AssignmentsService } from '../src/assignments/assignments.service';

const config: MqttConfig = { ...readMqttConfig({}), enabled: true, host: 'broker.invalid', port: 1883 };
const topic = 'publish/station/DEMO_STATION';
const packet = (value: unknown) => Buffer.from(JSON.stringify(value));
const telemetry = (result = '26.54 C', stream = 301) => ({ stationId: 'DEMO_STATION', sensorRecords: [{ dataStreamId: stream, result }] });
const page = { limit: 100, offset: 0 };

class FakeTransport extends MqttTransport {
  handlers?: TransportHandlers;
  stopped = false;
  start(handlers: TransportHandlers): void {
    this.handlers = handlers;
    handlers.state({ enabled: true, connected: true, subscribed: true, last_error: null });
  }
  async stop(): Promise<void> { this.stopped = true; this.handlers = undefined; }
  async publish(): Promise<{ status: 'TransportAccepted' }> { return { status: 'TransportAccepted' }; }
  emit(body: unknown, otherTopic = topic, retained = false): void { this.handlers!.message(otherTopic, packet(body), retained); }
}

class FakeClient extends EventEmitter {
  connected = false;
  subscriptions: { topic: string; qos: number; callback: (error: Error | null, grants?: { topic: string; qos: number }[]) => void }[] = [];
  publications: { topic: string; payload: string; options: { qos: number; retain: boolean }; callback: (error?: Error) => void }[] = [];
  ended = false;
  stream = { destroy: () => this.disconnect() };
  connect(): this { return this; }
  subscribe(topic: string, options: { qos: number }, callback: FakeClient['subscriptions'][number]['callback']): this {
    this.subscriptions.push({ topic, ...options, callback }); return this;
  }
  publish(topic: string, payload: string, options: { qos: number; retain: boolean }, callback: (error?: Error) => void): this {
    this.publications.push({ topic, payload, options, callback }); return this;
  }
  end(_force: boolean, _options: object, callback: () => void): this { this.ended = true; callback(); return this; }
  online(): void { this.connected = true; this.emit('connect'); }
  disconnect(): void { this.connected = false; this.emit('close'); }
  grant(index = this.subscriptions.length - 1, qos = 1): void {
    const subscription = this.subscriptions[index];
    subscription.callback(null, [{ topic: subscription.topic, qos }]);
  }
}
function adapter(overrides: Partial<MqttConfig> = {}) {
  const client = new FakeClient();
  let options: IClientOptions | undefined;
  const transport = new MqttJsTransport({ ...config, ...overrides }, (value) => {
    options = value; return client as unknown as MqttClient;
  });
  const states: BrokerState[] = [];
  const messages: string[] = [];
  transport.start({ state: (state) => states.push(state), message: (topic) => messages.push(topic) });
  return { client, transport, states, messages, get options() { return options; } };
}
async function fixture() {
  const transport = new FakeTransport();
  const f = await zoneFixture({ mqtt: config, transport });
  const zone = f.zones.create(f.owner.id, f.input);
  const devices = f.app.get(DevicesService);
  const device = devices.create(f.owner.id, { zone_id: zone.id, station_id: 'DEMO_STATION', installed_at: '2026-10-07T00:00:00Z', cost: 0 });
  const sensors = f.app.get(SensorsService);
  const sensor = sensors.create(f.owner.id, { device_id: device.id, name: 'Configured temperature', sensor_type: 'air_temperature', data_stream_id: '301', unit: 'C' });
  return { ...f, transport, device, devices, sensors, sensor, zone, mqtt: f.app.get(MqttService) };
}

test('MQTT configuration defaults to disabled, requires explicit runtime broker and fails without metadata modules', () => {
  assert.equal(readMqttConfig({}).enabled, false);
  assert.equal(readMqttConfig({}).offlineAfterMs, 1800000);
  assert.equal(readMqttConfig({ MQTT_ENABLED: 'true', MQTT_BROKER_HOST: 'broker.invalid', MQTT_BROKER_PORT: '8883', MQTT_USE_TLS: 'true' }).tls, true);
  for (const env of [
    { MQTT_ENABLED: 'yes' }, { MQTT_USE_TLS: '1' }, { MQTT_ENABLED: 'true' },
    { MQTT_ENABLED: 'true', MQTT_BROKER_HOST: 'mqtt://user:secret@broker.invalid', MQTT_BROKER_PORT: '1883' },
    { MQTT_ENABLED: 'true', MQTT_BROKER_HOST: 'broker.invalid' },
    { MQTT_ENABLED: 'true', MQTT_BROKER_HOST: 'broker.invalid', MQTT_BROKER_PORT: '1883', MQTT_USERNAME: 'user' },
    { MQTT_BROKER_PORT: '65536' }, { MQTT_OFFLINE_AFTER_MS: '0' }, { MQTT_RECONNECT_MS: '1.5' },
  ]) { assert.throws(() => readMqttConfig(env)); }
  assert.throws(() => readEnvironment({ DATABASE_URL: 'postgresql://test', MONGODB_URI: 'mongodb://test',
    MQTT_ENABLED: 'true', MQTT_BROKER_HOST: 'broker.invalid', MQTT_BROKER_PORT: '1883' }), /metadata/);
});

test('Verified telemetry parses numbers and original units, preserves v1.0 ACK correlation fields without claiming relay state', () => {
  const message = parseIncoming(topic, packet({ stationId: 'DEMO_STATION', sensorRecords: [
    { dataStreamId: 302, result: '77.80 %' }, { dataStreamId: 301, result: '26.54 C' }, { dataStreamId: 303, result: '0.00 %rH' },
  ] }));
  assert.equal(message.kind, 'Telemetry');
  if (message.kind !== 'Telemetry') { assert.fail(); }
  assert.deepEqual(message.readings.map(({ value, receivedUnit }) => ({ value, receivedUnit })), [
    { value: 77.8, receivedUnit: '%' }, { value: 26.54, receivedUnit: 'C' }, { value: 0, receivedUnit: '%rH' },
  ]);
  assert.deepEqual(parseIncoming(topic, packet({ stationId: 'DEMO_STATION', status: 'ACK', taskId: 99, action: 1 })), { kind: 'Ack', stationId: 'DEMO_STATION', taskId: 99, action: 1 });
  assert.equal(parseIncoming(topic, packet({ status: 'ACK', taskId: 99, action: 1 })).kind, 'Ack');
  assert.equal(parseIncoming(topic, packet({ ...telemetry(), status: 'ACK', taskId: 99, action: 1 })).kind, 'Telemetry');
  assert.equal(parseIncoming(topic, packet({ stationId: 'DEMO_STATION', status: 'OTHER' })).kind, 'Unknown');
});

test('ACK v1 rejects missing, unsafe, coerced IDs/actions and legacy ACK while retaining correlation fields', () => {
  for (const action of [0, 1] as const) {
    assert.deepEqual(parseIncoming(topic, packet({ taskId: 1001, status: 'ACK', action })),
      { kind: 'Ack', stationId: 'DEMO_STATION', taskId: 1001, action });
  }
  for (const body of [
    { status: 'ACK' }, { status: 'ACK', taskId: 1 }, { status: 'ACK', action: 0 },
    ...[0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1].map((taskId) => ({ status: 'ACK', taskId, action: 1 })),
    ...[-1, 2, '1', true, null].map((action) => ({ status: 'ACK', taskId: 1, action })),
  ]) { assert.throws(() => parseIncoming(topic, packet(body)), /INVALID_ACK/); }
});

test('Malformed packets, identity mismatches, unsafe streams and duplicate streams reject atomically', () => {
  const invalid = [
    null, [], {}, { stationId: 'OTHER', status: 'ACK', taskId: 99, action: 1 }, { stationId: null, status: 'ACK', taskId: 99, action: 1 },
    { sensorRecords: [], status: 'ACK', taskId: 99, action: 1 }, { sensorRecords: null, status: 'ACK', taskId: 99, action: 1 },
    { sensorRecords: [{ dataStreamId: '301', result: '1 C' }] },
    { sensorRecords: [{ dataStreamId: Number.MAX_SAFE_INTEGER + 1, result: '1 C' }] },
    { sensorRecords: [{ dataStreamId: -1, result: '1 C' }] },
    ...['NaN C', 'Infinity C', '26.54', '26.54C', '1.2.3 C', '1e2 C', '1 ' + 'x'.repeat(17), '1 \0'].map((result) => telemetry(result)),
    { sensorRecords: [telemetry().sensorRecords[0], telemetry().sensorRecords[0]] },
    { sensorRecords: Array.from({ length: 101 }, (_, i) => ({ dataStreamId: i + 1, result: '1 C' })) },
  ];
  for (const body of invalid.filter((body) => body !== invalid[2])) { assert.throws(() => parseIncoming(topic, packet(body))); }
  assert.equal(parseIncoming(topic, packet({})).kind, 'Unknown');
  for (const payload of [Buffer.from('{'), Buffer.from([0xff]), Buffer.alloc(MQTT_MAX_PAYLOAD_BYTES + 1), Buffer.alloc(0)]) {
    assert.throws(() => parseIncoming(topic, payload));
  }
  for (const badTopic of ['observation/sensor/301', 'publish/station/+', 'publish/station/a/b', 'publish/station/', 'publish/station/' + 'x'.repeat(51)]) {
    assert.throws(() => parseIncoming(badTopic, packet({ status: 'ACK', taskId: 99, action: 1 })));
  }
});

test('Control builder preserves verified ON/OFF numeric wire shape without hardcoded station/capability mapping', () => {
  for (const action of [0, 1] as const) {
    const output = buildControlPublication('DEMO_OTHER', [{ taskId: 1791308390924, taskingCapabilityId: 42 }], action);
    assert.equal(output.topic, 'subscribe/station/DEMO_OTHER');
    assert.deepEqual(JSON.parse(output.payload), { targets: [{ taskId: 1791308390924, taskingCapabilityId: 42 }],
      taskingParameters: { actionType: 'control', action } });
  }
  assert.throws(() => buildControlPublication('a/b', [], 0));
  assert.throws(() => buildControlPublication('DEMO', [{ taskId: 1, taskingCapabilityId: 1 }, { taskId: 1, taskingCapabilityId: 2 }], 1));
  assert.throws(() => buildControlPublication('DEMO', [{ taskId: Number.MAX_SAFE_INTEGER + 1, taskingCapabilityId: 1 }], 1));
});

test('Disabled MQTT never constructs a network client and stops cleanly', async () => {
  const a = adapter({ enabled: false });
  assert.equal(a.options, undefined);
  assert.equal(a.states.at(-1)?.enabled, false);
  await a.transport.stop();
});

test('MQTT adapter waits for SUBACK, resubscribes once per connection and ignores stale callbacks', async () => {
  const a = adapter();
  try {
    assert.equal(a.options?.manualConnect, true);
    assert.equal(a.options?.queueQoSZero, false);
    assert.equal(a.options?.resubscribe, false);
    a.client.online();
    a.client.emit('message', topic, packet({ status: 'ACK', taskId: 99, action: 1 }), { retain: false });
    assert.equal(a.messages.length, 0);
    assert.equal(a.client.subscriptions[0].topic, MQTT_RETURN_TOPIC);
    a.client.disconnect();
    a.client.grant(0);
    assert.equal(a.states.at(-1)?.subscribed, false);
    a.client.online(); a.client.grant(1);
    assert.equal(a.client.subscriptions.length, 2);
    assert.equal(a.states.at(-1)?.subscribed, true);
    a.client.emit('message', topic, packet({ status: 'ACK', taskId: 99, action: 1 }), { retain: false });
    assert.deepEqual(a.messages, [topic]);
  } finally { await a.transport.stop(); }
  assert.equal(a.client.ended, true);
  a.client.online(); a.client.grant(1);
  assert.equal(a.states.at(-1)?.connected, false);
});

test('MQTT denied or missing SUBACK closes the session for reconnect and emits sanitized error codes', async () => {
  const a = adapter({ connectTimeoutMs: 20 });
  try {
    a.client.online(); a.client.grant(0, 128);
    assert.equal(a.states.at(-1)?.last_error, 'SUBSCRIPTION_FAILED');
    assert.equal(a.client.connected, false);
    a.client.online();
    await delay(40);
    assert.equal(a.client.connected, false);
    a.client.grant(1);
    assert.equal(a.states.at(-1)?.subscribed, false);
    a.client.emit('error', new Error('secret broker detail'));
    assert.equal(a.states.at(-1)?.last_error, 'CONNECTION_FAILED');
    assert.ok(!JSON.stringify(a.states).includes('secret'));
  } finally { await a.transport.stop(); }
});

test('Internal publisher fails offline, never retains/queues and distinguishes write from hardware ACK', async () => {
  const a = adapter({ connectTimeoutMs: 30 });
  try {
    await assert.rejects(a.transport.publish('subscribe/station/DEMO', '{}'), /UNAVAILABLE/);
    assert.equal(a.client.publications.length, 0);
    a.client.online(); a.client.grant();
    await assert.rejects(a.transport.publish('subscribe/station/+', '{}'), /TOPIC/);
    const publication = buildControlPublication('DEMO', [{ taskId: 1, taskingCapabilityId: 42 }], 0);
    const pending = a.transport.publish(publication.topic, publication.payload);
    assert.deepEqual(a.client.publications[0].options, { qos: 0, retain: false });
    a.client.publications[0].callback();
    assert.deepEqual(await pending, { status: 'TransportAccepted' });
    const interrupted = a.transport.publish(publication.topic, publication.payload);
    a.client.disconnect(); a.client.publications[1].callback();
    await assert.rejects(interrupted, /PUBLISH_FAILED/);
    a.client.online(); a.client.grant();
    await assert.rejects(a.transport.publish(publication.topic, publication.payload), /PUBLISH_FAILED/);
    a.client.publications[2].callback();
  } finally { await a.transport.stop(); }
});

test('MQTT receiver uses the same stores as HTTP, maps per-device streams and preserves received unit snapshots', async () => {
  const f = await fixture();
  try {
    const second = f.devices.create(f.owner.id, { zone_id: f.zone.id, station_id: 'DEMO_OTHER', installed_at: '2026-10-07T00:00:00Z', cost: 0 });
    const secondSensor = f.sensors.create(f.owner.id, { device_id: second.id, name: 'Other', sensor_type: 'soil_moisture', data_stream_id: '301', unit: '%' });
    f.transport.emit(telemetry('26.54 oC'));
    f.transport.emit({ stationId: 'DEMO_OTHER', sensorRecords: [{ dataStreamId: 301, result: '70.00 %' }] }, 'publish/station/DEMO_OTHER');
    const first = f.mqtt.messages(f.owner.id, f.device.id, page).items[0];
    assert.equal(first.readings[0].sensor_id, f.sensor.id);
    assert.equal(first.readings[0].unit_mismatch, true);
    assert.equal(first.readings[0].receivedUnit, 'oC');
    assert.equal(first.readings[0].accepted, true);
    assert.equal(f.mqtt.messages(f.owner.id, second.id, page).items[0].readings[0].sensor_id, secondSensor.id);
    f.sensors.update(f.owner.id, f.sensor.id, { unit: '%rH' });
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].readings[0].receivedUnit, 'oC');
    first.readings[0].receivedUnit = 'BAD_CLIENT_WRITE';
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].readings[0].receivedUnit, 'oC');
    assert.notEqual(f.devices.get(f.owner.id, f.device.id).last_seen_at, null);
    assert.equal(f.devices.history(f.owner.id, f.device.id, page).total, 1);
  } finally { await f.app.close(); }
  assert.equal(f.transport.stopped, true);
});

test('Inactive/Maintenance Device or Inactive Sensor rejects new readings without deleting previous diagnostics', async () => {
  const f = await fixture();
  try {
    f.transport.emit(telemetry());
    for (const status of ['Maintenance', 'Inactive'] as const) {
      f.devices.update(f.owner.id, f.device.id, { status });
      f.transport.emit(telemetry());
      assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].readings[0].reason, 'DEVICE_UNAVAILABLE');
    }
    f.devices.update(f.owner.id, f.device.id, { status: 'Active' });
    f.sensors.update(f.owner.id, f.sensor.id, { status: 'Inactive' });
    f.transport.emit(telemetry());
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].readings[0].reason, 'SENSOR_UNAVAILABLE');
    f.transport.emit(telemetry('1 %', 999));
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].readings[0].reason, 'UNMAPPED_STREAM');
    const counts = f.mqtt.brokerStatus(f.admin.id);
    assert.equal(counts.accepted_readings, 1); assert.equal(counts.rejected_readings, 4);
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).total, 5);
  } finally { await f.app.close(); }
});

test('Unknown, retained, mismatched, malformed or unregistered messages cannot refresh last_seen_at', async () => {
  const f = await fixture();
  try {
    f.transport.emit({ status: 'OTHER' });
    f.transport.emit({ status: 'ACK', taskId: 99, action: 1 }, topic, true);
    f.transport.emit({ stationId: 'OTHER', status: 'ACK', taskId: 99, action: 1 });
    f.transport.emit({ sensorRecords: [] });
    f.transport.emit({ status: 'ACK', taskId: 99, action: 1 }, 'publish/station/UNREGISTERED');
    assert.equal(f.devices.getRecord(f.device.id).last_seen_at, null);
    const counts = f.mqtt.brokerStatus(f.admin.id);
    assert.equal(counts.unknown, 1); assert.equal(counts.rejected, 4);
    f.transport.emit({ stationId: 'DEMO_STATION', status: 'ACK', taskId: 99, action: 1 });
    assert.notEqual(f.devices.getRecord(f.device.id).last_seen_at, null);
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).items[0].reason, 'ACK_NOT_WAITING');
    assert.equal(f.app.get(ActuatorsService).list(f.owner.id, page).total, 0);
  } finally { await f.app.close(); }
});

test('Connectivity is derived from reception age, expires at threshold and never changes administrative status', async () => {
  const f = await fixture();
  try {
    assert.equal(f.mqtt.deviceStatus(f.owner.id, f.device.id).connectivity, 'Unknown');
    f.transport.emit({ status: 'ACK', taskId: 99, action: 1 });
    const time = Date.parse(f.devices.getRecord(f.device.id).last_seen_at!);
    assert.equal(f.mqtt.deviceStatus(f.owner.id, f.device.id, time + config.offlineAfterMs - 1).connectivity, 'Online');
    assert.equal(f.mqtt.deviceStatus(f.owner.id, f.device.id, time + config.offlineAfterMs).connectivity, 'Offline');
    f.transport.handlers!.state({ enabled: true, connected: false, subscribed: false, last_error: 'CONNECTION_FAILED' });
    assert.equal(f.mqtt.deviceStatus(f.owner.id, f.device.id).broker_connected, false);
    assert.equal(f.devices.getRecord(f.device.id).status, 'Active');
  } finally { await f.app.close(); }
});

test('MQTT HTTP diagnostics require JWT and current Device read scope, with Admin-only global status', async () => {
  const f = await fixture();
  try {
    f.transport.emit(telemetry());
    const owner = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const worker = await f.login(f.worker.phone_number);
    const manager = await f.login(f.manager.phone_number);
    assert.equal((await f.http('mqtt/status')).status, 401);
    assert.equal((await f.http('mqtt/status', 'GET', undefined, owner)).status, 403);
    const response = await f.http('mqtt/status', 'GET', undefined, admin);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes(config.host));
    assert.ok(!body.includes('password'));
    assert.equal((await f.http('mqtt/devices/not-uuid/status', 'GET', undefined, owner)).status, 400);
    assert.equal((await f.http('mqtt/devices/' + f.device.id + '/messages', 'GET', undefined, worker)).status, 404);
    assert.equal((await f.http('mqtt/devices/' + f.device.id + '/status', 'GET', undefined, manager)).status, 404);
    f.join();
    assert.equal((await f.http('mqtt/devices/' + f.device.id + '/status', 'GET', undefined, manager)).status, 200);
    const assignments = f.app.get(AssignmentsService);
    const now = Date.now();
    const assignment = assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id,
      start_date: new Date(now - 60000).toISOString(), end_date: new Date(now + 60000).toISOString() });
    assignments.approve(f.worker.id, assignment.id);
    assert.equal((await f.http('mqtt/devices/' + f.device.id + '/messages', 'GET', undefined, worker)).status, 200);
    assert.equal((await f.http('mqtt/devices/' + f.device.id + '/messages?limit=0', 'GET', undefined, owner)).status, 400);
    assert.equal((await f.http('mqtt/publish', 'POST', { action: 1 }, owner)).status, 404);
  } finally { await f.app.close(); }
});

test('Transport diagnostics evict oldest events at fixed capacity while preserving aggregate counters', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < MQTT_DIAGNOSTIC_LIMIT + 5; i++) { f.transport.emit({ status: 'ACK', taskId: 99, action: 1 }); }
    assert.equal(f.mqtt.messages(f.owner.id, f.device.id, page).total, MQTT_DIAGNOSTIC_LIMIT);
    assert.equal(f.mqtt.brokerStatus(f.admin.id).ack, MQTT_DIAGNOSTIC_LIMIT + 5);
  } finally { await f.app.close(); }
});
