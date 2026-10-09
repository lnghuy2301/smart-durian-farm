import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, Socket } from 'node:net';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { generate, Packet, parser } from 'mqtt-packet';
import { MqttJsTransport } from '../src/mqtt/mqtt.transport';
import { readMqttConfig } from '../src/mqtt/mqtt.config';
import { buildControlPublication, MQTT_RETURN_TOPIC, parseIncoming } from '../src/mqtt/mqtt.protocol';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { DevicesService } from '../src/devices/devices.service';
import { SensorsService } from '../src/sensors/sensors.service';
import { TelemetryService } from '../src/telemetry/telemetry.service';
import { MqttService } from '../src/mqtt/mqtt.service';

// Broker test fixture only: validates real MQTT.js TCP frames without touching any deployed station.
test('MQTT.js real loopback connection subscribes, routes telemetry/ACK and writes verified OFF packet', { timeout: 10000 }, async () => {
  const sockets = new Set<Socket>();
  const incoming: Packet[] = [];
  let resolveCommand!: (packet: Packet) => void;
  const command = new Promise<Packet>((resolve) => { resolveCommand = resolve; });
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const decoder = parser({ protocolVersion: 4 });
    decoder.on('error', () => socket.destroy());
    decoder.on('packet', (packet: Packet) => {
      incoming.push(packet);
      if (packet.cmd === 'connect') { socket.write(generate({ cmd: 'connack', sessionPresent: false, returnCode: 0 })); }
      if (packet.cmd === 'subscribe') {
        socket.write(generate({ cmd: 'suback', messageId: packet.messageId!, granted: [1] }));
        // Give the client SUBACK before publications. These are synthetic sensor/ACK messages, not real hardware.
        setTimeout(() => {
          if (socket.destroyed) { return; }
          for (const payload of [
            { stationId: 'DEMO_LOCAL', sensorRecords: [{ dataStreamId: 301, result: '26.54 C' }] },
            { stationId: 'DEMO_LOCAL', status: 'ACK', taskId: 99, action: 1 },
          ]) {
            socket.write(generate({ cmd: 'publish', topic: 'publish/station/DEMO_LOCAL', payload: JSON.stringify(payload), qos: 0, retain: false, dup: false }));
          }
        }, 10);
      }
      if (packet.cmd === 'publish') { resolveCommand(packet); }
      if (packet.cmd === 'pingreq') { socket.write(generate({ cmd: 'pingresp' })); }
    });
    socket.on('data', (bytes) => decoder.parse(bytes));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const transport = new MqttJsTransport({ ...readMqttConfig({}), enabled: true, host: '127.0.0.1', port: address.port });
  const kinds: string[] = [];
  let resolveReady!: () => void;
  let resolveMessages!: () => void;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  const messages = new Promise<void>((resolve) => { resolveMessages = resolve; });
  try {
    transport.start({
      state: (state) => { if (state.subscribed) { resolveReady(); } },
      message: (topic, payload) => { kinds.push(parseIncoming(topic, payload).kind); if (kinds.length === 2) { resolveMessages(); } },
    });
    await ready; await messages;
    assert.deepEqual(kinds, ['Telemetry', 'Ack']);
    const subscribe = incoming.find((packet) => packet.cmd === 'subscribe');
    assert.ok(subscribe?.cmd === 'subscribe');
    assert.equal(subscribe.subscriptions[0].topic, MQTT_RETURN_TOPIC);
    const publication = buildControlPublication('DEMO_LOCAL', [{ taskId: 1, taskingCapabilityId: 42 }], 0);
    assert.deepEqual(await transport.publish(publication.topic, publication.payload), { status: 'TransportAccepted' });
    const received = await command;
    assert.ok(received.cmd === 'publish');
    assert.equal(received.topic, 'subscribe/station/DEMO_LOCAL');
    assert.equal(received.qos, 0);
    assert.equal(received.retain, false);
    assert.deepEqual(JSON.parse(received.payload.toString()), JSON.parse(publication.payload));
  } finally {
    await transport.stop();
    for (const socket of sockets) { socket.destroy(); }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Real MQTT.js broker packets reach the shared Telemetry store and read-only HTTP API', { timeout: 60000 }, async () => {
  const sockets = new Set<Socket>();
  let stationSocket: Socket | undefined;
  const server = createServer((socket) => {
    sockets.add(socket); stationSocket = socket;
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const decoder = parser({ protocolVersion: 4 });
    decoder.on('error', () => socket.destroy());
    decoder.on('packet', (packet: Packet) => {
      if (packet.cmd === 'connect') { socket.write(generate({ cmd: 'connack', sessionPresent: false, returnCode: 0 })); }
      if (packet.cmd === 'subscribe') { socket.write(generate({ cmd: 'suback', messageId: packet.messageId!, granted: [1] })); }
      if (packet.cmd === 'pingreq') { socket.write(generate({ cmd: 'pingresp' })); }
    });
    socket.on('data', (bytes) => decoder.parse(bytes));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let f: Awaited<ReturnType<typeof zoneFixture>> | undefined;
  try {
    f = await zoneFixture({ mqtt: { ...readMqttConfig({}), enabled: true, host: '127.0.0.1', port: address.port } });
    const zone = f.zones.create(f.owner.id, f.input);
    const device = f.app.get(DevicesService).create(f.owner.id, {
      zone_id: zone.id, station_id: 'DEMO_LOCAL', installed_at: '2026-10-07T00:00:00Z', cost: 0,
    });
    f.app.get(SensorsService).create(f.owner.id, {
      device_id: device.id, name: 'Loopback temperature', sensor_type: 'air_temperature', data_stream_id: '301', unit: 'C',
    });
    const mqtt = f.app.get(MqttService), telemetry = f.app.get(TelemetryService);
    const deadline = Date.now() + 3000;
    while (!mqtt.brokerStatus(f.admin.id).subscribed && Date.now() < deadline) { await delay(10); }
    assert.equal(mqtt.brokerStatus(f.admin.id).subscribed, true);
    assert.ok(stationSocket);
    for (const payload of [
      { stationId: 'DEMO_LOCAL', sensorRecords: [{ dataStreamId: 301, result: '10 C' }] },
      { stationId: 'DEMO_LOCAL', sensorRecords: [{ dataStreamId: 301, result: '11 C' }] },
      { stationId: 'DEMO_LOCAL', status: 'ACK', taskId: 99, action: 1 },
    ]) {
      stationSocket.write(generate({ cmd: 'publish', topic: 'publish/station/DEMO_LOCAL',
        payload: JSON.stringify(payload), qos: 0, retain: false, dup: false }));
    }
    while (mqtt.brokerStatus(f.admin.id).ack < 1 && Date.now() < deadline) { await delay(10); }
    assert.equal(mqtt.brokerStatus(f.admin.id).ack, 1);
    assert.equal(telemetry.history(f.owner.id, device.id, { limit: 20, offset: 0 }).total, 2);
    const token = await f.login(f.owner.phone_number);
    const response = await f.http('telemetry/devices/' + device.id + '/latest', 'GET', undefined, token);
    assert.equal(response.status, 200);
    const result = await response.json() as { items: { device_id: string; value: number }[]; total: number };
    assert.equal(result.total, 1); assert.equal(result.items[0].value, 11);
    assert.equal(result.items[0].device_id, device.id);
  } finally {
    if (f) { await f.app.close(); }
    for (const socket of sockets) { socket.destroy(); }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
