import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { setImmediate as turn, setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { readMqttConfig } from '../src/mqtt/mqtt.config';
import { MqttTransport, TransportHandlers } from '../src/mqtt/mqtt.transport';
import { MqttService } from '../src/mqtt/mqtt.service';
import { DevicesService } from '../src/devices/devices.service';
import { ActuatorsService } from '../src/actuators/actuators.service';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { MockZoneAssignmentStore } from '../src/assignments/mock-zone-assignment.store';
import { ActuatorTasksService, ACTUATOR_TASK_LIMIT } from '../src/actuator-tasks/actuator-tasks.service';
import { readActuatorTasksConfig } from '../src/actuator-tasks/actuator-tasks.config';
import { ActuatorTask } from '../src/actuator-tasks/actuator-tasks.types';

interface Wire { targets: { taskId: number; taskingCapabilityId: number }[]; taskingParameters: { actionType: 'control'; action: 0 | 1 } }
class FakeTransport extends MqttTransport {
  handlers?: TransportHandlers;
  sent: { topic: string; wire: Wire }[] = [];
  deferred?: { resolve: () => void; reject: () => void };
  hold = false;
  failNext = false;
  fastAck = false;
  start(handlers: TransportHandlers): void { this.handlers = handlers; this.connect(true); }
  async stop(): Promise<void> { this.handlers = undefined; }
  connect(ready: boolean) { this.handlers!.state({ enabled: true, connected: ready, subscribed: ready, last_error: null }); }
  publish(topic: string, payload: string): Promise<{ status: 'TransportAccepted' }> {
    this.sent.push({ topic, wire: JSON.parse(payload) as Wire });
    if (this.fastAck) { this.ack(); }
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error('private transport error')); }
    if (this.hold) {
      return new Promise((resolve, reject) => { this.deferred = { resolve: () => resolve({ status: 'TransportAccepted' }),
        reject: () => reject(new Error('private transport error')) }; });
    }
    return Promise.resolve({ status: 'TransportAccepted' });
  }
  ack(index = this.sent.length - 1, changes: object = {}, station?: string, retained = false): void {
    const { wire, topic } = this.sent[index];
    this.handlers!.message('publish/station/' + (station ?? topic.split('/').at(-1)),
      Buffer.from(JSON.stringify({ taskId: wire.targets[0].taskId, status: 'ACK', action: wire.taskingParameters.action, ...changes })), retained);
  }
}
const page = { limit: 100, offset: 0 };
const status = (code: number) => (error: unknown) => error instanceof HttpException && error.getStatus() === code;
async function fixture(timeout = 10000) {
  const transport = new FakeTransport();
  const f = await zoneFixture({ mqtt: { ...readMqttConfig({}), enabled: true, host: 'broker.invalid', port: 1883 },
    transport, actuatorTasks: { ackTimeoutMs: timeout } });
  const zone = f.zones.create(f.owner.id, f.input), devices = f.app.get(DevicesService), actuators = f.app.get(ActuatorsService);
  const install = (station: string) => {
    const device = devices.create(f.owner.id, { zone_id: zone.id, station_id: station, installed_at: '2026-10-07T00:00:00Z', cost: 0 });
    const relays = ([['shared', 2], ['watering', 3], ['spraying', 4]] as const).map(([purpose, capability_id]) =>
      actuators.create(f.owner.id, { device_id: device.id, name: purpose, purpose, capability_id }));
    return { device, relays };
  };
  const { device, relays } = install('DEMO_STATION');
  const tasks = f.app.get(ActuatorTasksService), assignments = f.app.get(AssignmentsService);
  const get = (id: string) => tasks.get(f.owner.id, id);
  const shape = () => transport.sent.map(({ wire }) => [wire.targets[0].taskingCapabilityId, wire.taskingParameters.action]);
  const acknowledge = async () => { transport.ack(); await turn(); };
  const off = async () => { const task = tasks.command(f.owner.id, device.id, 'Stop').task; await turn();
    for (let i = 0; i < 3; i++) { await acknowledge(); } return task; };
  return { ...f, transport, zone, devices, actuators, device, relays, install, tasks, assignments, get, shape, acknowledge, off };
}

test('ACK timeout config defaults to 10s and rejects malformed/out-of-range values', () => {
  assert.deepEqual(readActuatorTasksConfig({}), { ackTimeoutMs: 10000 });
  for (const raw of ['', '0', '99', '60001', '-1', '100.5', ' 10000', 'NaN']) {
    assert.throws(() => readActuatorTasksConfig({ ACTUATOR_ACK_TIMEOUT_MS: raw }));
  }
  assert.equal(readActuatorTasksConfig({ ACTUATOR_ACK_TIMEOUT_MS: '10000' }).ackTimeoutMs, 10000);
});

test('HTTP returns 202 Pending with OpenAPI schemas; backend alone sets IDs/times/ACKs', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number), route = 'actuator-tasks/devices/' + f.device.id;
    assert.equal((await f.http(route + '/commands', 'POST', { operation: 'Watering' })).status, 401);
    for (const body of [{}, { operation: 'Reset' }, { operation: 'Watering', confirmed_at: '2026-10-09T00:00:00Z' },
      { operation: 'Watering', targets: [] }, { operation: 'Watering', created_by: f.owner.id }]) {
      assert.equal((await f.http(route + '/commands', 'POST', body, token)).status, 400);
    }
    for (const suffix of ['?limit=0', '?limit=101', '?offset=-1', '?status=other', '?device_id=x']) {
      assert.equal((await f.http(route + suffix, 'GET', undefined, token)).status, 400);
    }
    assert.equal((await f.http('actuator-tasks/not-object-id', 'GET', undefined, token)).status, 400);
    const response = await f.http(route + '/commands', 'POST', { operation: 'Watering' }, token);
    assert.equal(response.status, 202);
    const body = await response.json() as { task: ActuatorTask; status_url: string };
    assert.equal(body.task.status, 'Pending'); assert.equal(body.task.sent_at, null); assert.equal(body.task.confirmed_at, null);
    assert.equal(body.task.response_payload.confirmation_kind, 'CommandReceipt');
    assert.ok(body.task.response_payload.reset_task_id); assert.ok(!('created_by' in body.task));
    assert.equal((await f.http(body.status_url.replace('/api/', ''), 'GET', undefined, token)).status, 200);
    for (const method of ['PATCH', 'DELETE', 'POST']) {
      assert.equal((await f.http('actuator-tasks/' + body.task._id, method, { status: 'Confirmed' }, token)).status, 404);
    }
    const swagger = await fetch((await f.app.getUrl()) + '/api/docs-json');
    const spec = await swagger.json() as { paths: Record<string, { post?: { responses: Record<string, { content?: object }> }; get?: { responses: Record<string, { content?: object }> } }> };
    assert.ok(spec.paths['/api/actuator-tasks/devices/{deviceId}/commands'].post!.responses['202'].content);
    assert.ok(spec.paths['/api/actuator-tasks/{id}'].get!.responses['200'].content);
  } finally { await f.app.close(); }
});

test('Unknown Start resets pump and BOTH valves before valve ON then pump ON; confirms only after all matching ACKs', async () => {
  const f = await fixture();
  try {
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    assert.deepEqual(f.shape(), [[2, 0]]);
    for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.deepEqual(f.shape(), [[2, 0], [3, 0], [4, 0], [3, 1]]);
    assert.equal(f.get(task._id).confirmed_at, null);
    assert.equal(f.get(task.response_payload.reset_task_id!).status, 'Confirmed');
    await f.acknowledge(); assert.deepEqual(f.shape().at(-1), [2, 1]);
    assert.equal(f.get(task._id).status, 'Pending');
    await f.acknowledge();
    const done = f.get(task._id);
    assert.equal(done.status, 'Confirmed'); assert.equal(done.confirmed_at, done.response_payload.steps.at(-1)!.ack_received_at);
    assert.equal(f.tasks.state(f.owner.id, f.device.id).acknowledged_mode, 'Watering');
    assert.equal(f.tasks.state(f.owner.id, f.device.id).physical_state, 'Unknown');
    assert.equal(f.tasks.state(f.owner.id, f.device.id).busy, false);
    assert.equal(new Set(f.transport.sent.map(({ wire }) => wire.targets[0].taskId)).size, 5);
    assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Spraying'), status(409));
    const stop = f.tasks.command(f.owner.id, f.device.id, 'Stop').task; await turn();
    await f.acknowledge(); await f.acknowledge();
    assert.equal(f.get(stop._id).status, 'Confirmed'); assert.deepEqual(f.shape().slice(-2), [[2, 0], [3, 0]]);
    const spray = f.tasks.command(f.owner.id, f.device.id, 'Spraying').task; await turn();
    assert.equal(spray.response_payload.reset_task_id, null);
    await f.acknowledge(); await f.acknowledge();
    assert.deepEqual(f.shape().slice(-2), [[4, 1], [2, 1]]);
    assert.equal(f.get(spray._id).status, 'Confirmed');
    f.tasks.command(f.owner.id, f.device.id, 'Stop'); await turn(); await f.acknowledge(); await f.acknowledge();
    assert.deepEqual(f.shape().slice(-2), [[2, 0], [4, 0]]);
  } finally { await f.app.close(); }
});

test('Wrong Device/action/ID, retained/legacy/duplicate ACKs cannot advance a pending command', async () => {
  const f = await fixture();
  try {
    f.install('OTHER'); const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    f.transport.ack(0, {}, 'OTHER'); f.transport.ack(0, { action: 1 }); f.transport.ack(0, { taskId: 1 });
    f.transport.ack(0, {}, undefined, true); f.transport.ack(0, { taskId: null }); await turn();
    assert.equal(f.transport.sent.length, 1); assert.equal(f.get(task._id).status, 'Pending');
    const reasons = f.app.get(MqttService).messages(f.owner.id, f.device.id, page).items.map((event) => event.reason);
    assert.ok(reasons.includes('ACK_ACTION_MISMATCH')); assert.ok(reasons.includes('RETAINED_MESSAGE')); assert.ok(reasons.includes('INVALID_ACK'));
    await f.acknowledge(); f.transport.ack(0); await turn(); assert.equal(f.transport.sent.length, 2);
    assert.equal(f.tasks.receiveAck(f.device.id, f.transport.sent[0].wire.targets[0].taskId, 0), 'ACK_NOT_WAITING');
  } finally { await f.app.close(); }
});

test('Missing pump-OFF Reset ACK fails Start without ever sending valve close or ON', async () => {
  const f = await fixture(35);
  try {
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn(); await delay(60);
    assert.equal(f.get(task._id).error_message, 'RESET_FAILED');
    assert.equal(f.get(task.response_payload.reset_task_id!).error_message, 'ACK_TIMEOUT');
    assert.deepEqual(f.shape(), [[2, 0]]); assert.equal(f.tasks.state(f.owner.id, f.device.id).acknowledged_mode, 'Unknown');
    f.transport.ack(0); await turn(); assert.equal(f.transport.sent.length, 1);
  } finally { await f.app.close(); }
});

test('Partial Start timeout keeps Failed Start, creates separate recovery and ignores late ON ACK', async () => {
  const f = await fixture(60);
  try {
    await f.off(); const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    await f.acknowledge(); const oldPump = f.transport.sent.length - 1;
    await delay(85);
    const failed = f.get(task._id); assert.equal(failed.status, 'Failed'); assert.equal(failed.error_message, 'ACK_TIMEOUT');
    assert.equal(failed.confirmed_at, null); assert.ok(failed.response_payload.recovery_task_id);
    assert.deepEqual(f.shape().at(-1), [2, 0]);
    f.transport.ack(oldPump); await turn(); assert.equal(f.get(task._id).status, 'Failed');
    for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.equal(f.get(failed.response_payload.recovery_task_id!).status, 'Confirmed');
    assert.deepEqual(f.shape().slice(-3), [[2, 0], [3, 0], [4, 0]]);
    assert.equal(f.tasks.state(f.owner.id, f.device.id).acknowledged_mode, 'Off');
  } finally { await f.app.close(); }
});

test('Recovery pump-OFF ACK timeout leaves Unknown and does not close valves', async () => {
  const f = await fixture(35);
  try {
    await f.off(); const task = f.tasks.command(f.owner.id, f.device.id, 'Spraying').task; await turn();
    await f.acknowledge(); await delay(90);
    const failed = f.get(task._id), recovery = f.get(failed.response_payload.recovery_task_id!);
    assert.equal(recovery.status, 'Failed'); assert.equal(recovery.error_message, 'ACK_TIMEOUT');
    assert.deepEqual(f.shape().slice(-3), [[4, 1], [2, 1], [2, 0]]);
    assert.equal(f.tasks.state(f.owner.id, f.device.id).reset_required, true);
    f.tasks.command(f.owner.id, f.device.id, 'Watering'); await turn(); assert.deepEqual(f.shape().at(-1), [2, 0]);
  } finally { await f.app.close(); }
});

test('Stop preempts Start and cancels unsent pump ON even if valve ACK arrived immediately before Stop', async () => {
  const f = await fixture();
  try {
    await f.off(); const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    const old = f.transport.sent.length - 1; f.transport.ack();
    const stop = f.tasks.command(f.owner.id, f.device.id, 'Stop').task;
    assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Watering'), status(409));
    assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Stop'), status(409)); await turn();
    assert.equal(f.get(task._id).error_message, 'CANCELLED_BY_STOP');
    assert.equal(f.get(task._id).response_payload.steps[1].status, 'Cancelled');
    f.transport.ack(old); for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.equal(f.get(stop._id).status, 'Confirmed'); assert.ok(!f.shape().some(([cap, action]) => cap === 2 && action === 1));
  } finally { await f.app.close(); }
});

test('Disconnect fails runs; reconnect never replays ON and next Start performs Reset again', async () => {
  const f = await fixture();
  try {
    await f.off(); const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    f.transport.connect(false); const failed = f.get(task._id);
    assert.equal(failed.error_message, 'MQTT_DISCONNECTED');
    assert.equal(f.get(failed.response_payload.recovery_task_id!).status, 'Failed');
    const count = f.transport.sent.length;
    assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Stop'), status(503));
    f.transport.connect(true); await turn(); assert.equal(f.transport.sent.length, count);
    const next = f.tasks.command(f.owner.id, f.device.id, 'Spraying').task; await turn();
    assert.ok(next.response_payload.reset_task_id); assert.deepEqual(f.shape().at(-1), [2, 0]);
  } finally { await f.app.close(); }
});

test('Recheck actor assignment before each ON; loss after valve ACK suppresses pump ON but recovery OFF remains allowed', async () => {
  const f = await fixture();
  try {
    await f.off(); const invite = f.assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id });
    const accepted = f.assignments.approve(f.worker.id, invite.id);
    const task = f.tasks.command(f.worker.id, f.device.id, 'Watering').task; await turn();
    f.assignments.end(f.owner.id, accepted.assignment_id!); await f.acknowledge();
    assert.equal(f.get(task._id).status, 'Failed'); assert.deepEqual(f.shape().at(-1), [2, 0]);
    assert.throws(() => f.tasks.get(f.worker.id, task._id), status(404));
    for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.equal(f.get(f.get(task._id).response_payload.recovery_task_id!).status, 'Confirmed');
    assert.ok(!f.shape().some(([cap, action]) => cap === 2 && action === 1));
  } finally { await f.app.close(); }
});

test('Recheck availability before pump ON; Stop remains available on Inactive metadata', async () => {
  const f = await fixture();
  try {
    await f.off(); const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    f.actuators.update(f.owner.id, f.relays[0].id, { status: 'Inactive' });
    f.devices.update(f.owner.id, f.device.id, { status: 'Maintenance' }); await f.acknowledge();
    assert.equal(f.get(task._id).status, 'Failed');
    for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Watering'), status(409));
    f.tasks.command(f.owner.id, f.device.id, 'Stop'); await turn(); assert.deepEqual(f.shape().at(-1), [2, 0]);
  } finally { await f.app.close(); }
});

test('Fast ACK waits for publish success; publish failure never confirms or leaks transport errors', async () => {
  const f = await fixture();
  try {
    f.transport.hold = true; f.transport.fastAck = true;
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    assert.equal(f.transport.sent.length, 1); assert.equal(f.get(task.response_payload.reset_task_id!).status, 'Pending');
    assert.equal(f.tasks.receiveAck(f.device.id, f.transport.sent[0].wire.targets[0].taskId, 0), 'ACK_DUPLICATE');
    f.transport.hold = false; f.transport.deferred!.resolve(); await turn();
    assert.equal(f.get(task._id).status, 'Confirmed'); assert.equal(f.transport.sent.length, 5);
    f.transport.fastAck = false; f.transport.failNext = true;
    const stop = f.tasks.command(f.owner.id, f.device.id, 'Stop').task; await turn();
    assert.equal(f.get(stop._id).error_message, 'MQTT_PUBLISH_FAILED');
    assert.ok(!JSON.stringify(f.tasks.list(f.owner.id, f.device.id, page)).includes('private'));
  } finally { await f.app.close(); }
});

test('ACK exactly at deadline is expired and cannot revive a failed Reset', async () => {
  const f = await fixture();
  try {
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    const first = f.transport.sent[0].wire.targets[0].taskId, reset = f.get(task.response_payload.reset_task_id!);
    assert.equal(f.tasks.receiveAck(f.device.id, first, 0, Date.parse(reset.sent_at!) + 10000), 'ACK_EXPIRED');
    assert.equal(f.get(task._id).error_message, 'RESET_FAILED');
    assert.equal(f.tasks.receiveAck(f.device.id, first, 0), 'ACK_NOT_WAITING');
  } finally { await f.app.close(); }
});

test('Every step gets a new ACK timeout even when total Reset duration exceeds one timeout', async () => {
  const f = await fixture(150);
  try {
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    for (let i = 0; i < 3; i++) { await delay(80); await f.acknowledge(); }
    assert.equal(f.get(task.response_payload.reset_task_id!).status, 'Confirmed');
    assert.equal(f.get(task._id).status, 'Pending');
    await f.acknowledge(); await f.acknowledge(); assert.equal(f.get(task._id).status, 'Confirmed');
  } finally { await f.app.close(); }
});

test('Stop preempts a Reset with an outstanding publish callback; callback and late ACK cannot send ON', async () => {
  const f = await fixture();
  try {
    f.transport.hold = true;
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    const deferred = f.transport.deferred!;
    f.transport.hold = false;
    const stop = f.tasks.command(f.owner.id, f.device.id, 'Stop').task; await turn();
    f.transport.ack(0); deferred.resolve(); await turn();
    assert.equal(f.get(task._id).error_message, 'CANCELLED_BY_STOP');
    assert.equal(f.get(task.response_payload.reset_task_id!).error_message, 'CANCELLED_BY_STOP');
    for (let i = 0; i < 3; i++) { await f.acknowledge(); }
    assert.equal(f.get(stop._id).status, 'Confirmed'); assert.ok(f.shape().every(([, action]) => action === 0));
  } finally { await f.app.close(); }
});

test('ON publish failure triggers separate OFF recovery even if a fast ON receipt arrived before failed publish callback', async () => {
  const f = await fixture();
  try {
    await f.off(); f.transport.fastAck = true; f.transport.failNext = true;
    const task = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    const failed = f.get(task._id);
    assert.equal(failed.status, 'Failed'); assert.equal(failed.error_message, 'MQTT_PUBLISH_FAILED');
    assert.equal(failed.confirmed_at, null); assert.equal(f.get(failed.response_payload.recovery_task_id!).status, 'Confirmed');
    assert.deepEqual(f.shape().slice(-4), [[3, 1], [2, 0], [3, 0], [4, 0]]);
  } finally { await f.app.close(); }
});

test('Owner controls; Admin/Manager only read correct HTX, invitation grants nothing and past Farmers lose history', async () => {
  const f = await fixture();
  try {
    await f.off();
    assert.throws(() => f.tasks.command(f.admin.id, f.device.id, 'Stop'), status(403));
    assert.throws(() => f.tasks.list(f.manager.id, f.device.id, page), status(404)); f.join();
    assert.throws(() => f.tasks.command(f.manager.id, f.device.id, 'Stop'), status(403));
    assert.equal(f.tasks.list(f.admin.id, f.device.id, page).total, 1);
    assert.equal(f.tasks.list(f.manager.id, f.device.id, page).total, 1);
    const invite = f.assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id });
    assert.throws(() => f.tasks.command(f.worker.id, f.device.id, 'Watering'), status(404));
    const accepted = f.assignments.approve(f.worker.id, invite.id);
    assert.equal(f.tasks.list(f.worker.id, f.device.id, page).total, 0);
    const task = f.tasks.command(f.worker.id, f.device.id, 'Spraying').task; await turn();
    await f.acknowledge(); await f.acknowledge();
    assert.equal(f.tasks.get(f.worker.id, task._id).status, 'Confirmed');
    f.assignments.end(f.owner.id, accepted.assignment_id!);
    assert.throws(() => f.tasks.get(f.worker.id, task._id), status(404));
    const store = f.app.get(MockZoneAssignmentStore), time = Date.now() + 1000, original = Date.now;
    store.accept(f.worker.id, f.zone, new Date(time).toISOString(), null, new Date(time).toISOString());
    Date.now = () => time;
    try { assert.equal(f.tasks.list(f.worker.id, f.device.id, page).total, 0); }
    finally { Date.now = original; }
  } finally { await f.app.close(); }
});

test('Independent Devices have independent locks and matching ACKs never cross their runs', async () => {
  const f = await fixture();
  try {
    const other = f.install('OTHER'); f.tasks.command(f.owner.id, f.device.id, 'Watering');
    f.tasks.command(f.owner.id, other.device.id, 'Spraying'); await turn();
    assert.equal(f.transport.sent.length, 2); assert.throws(() => f.tasks.command(f.owner.id, f.device.id, 'Watering'), status(409));
    f.transport.ack(0, {}, 'OTHER'); await turn(); assert.equal(f.transport.sent.length, 2);
    f.transport.ack(1); await turn(); assert.equal(f.transport.sent.length, 3);
    assert.equal(f.transport.sent[2].topic, 'subscribe/station/OTHER');
  } finally { await f.app.close(); }
});

test('Journal retains Pending, evicts oldest terminal only, returns defensive snapshots and shuts down without ON replay', async () => {
  const f = await fixture();
  try {
    f.transport.fastAck = true;
    const first = await f.off();
    for (let i = 1; i < ACTUATOR_TASK_LIMIT; i++) { f.tasks.command(f.owner.id, f.device.id, 'Stop'); await turn(); }
    const newest = f.tasks.list(f.owner.id, f.device.id, page).items[0]; newest.response_payload.steps[0].ack = null;
    assert.ok(f.get(newest._id).response_payload.steps[0].ack);
    f.transport.fastAck = false;
    const pending = f.tasks.command(f.owner.id, f.device.id, 'Watering').task; await turn();
    assert.equal(f.tasks.list(f.owner.id, f.device.id, page).total, 5000);
    assert.throws(() => f.get(first._id), status(404));
    const count = f.transport.sent.length;
    f.tasks.onModuleDestroy(); await turn();
    assert.equal(f.get(pending._id).error_message, 'BACKEND_SHUTDOWN'); assert.equal(f.transport.sent.length, count);
  } finally { await f.app.close(); }
});
