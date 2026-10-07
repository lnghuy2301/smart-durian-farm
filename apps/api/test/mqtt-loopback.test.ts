import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, Socket } from 'node:net';
import { test } from 'node:test';
import { generate, Packet, parser } from 'mqtt-packet';
import { MqttJsTransport } from '../src/mqtt/mqtt.transport';
import { readMqttConfig } from '../src/mqtt/mqtt.config';
import { buildControlPublication, MQTT_RETURN_TOPIC, parseIncoming } from '../src/mqtt/mqtt.protocol';

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
            { stationId: 'DEMO_LOCAL', status: 'ACK' },
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
