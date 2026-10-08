import { createServer } from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
const { parser, generate } = createRequire(import.meta.url)("mqtt-packet");

// Chỉ fixture MQTT TCP trên loopback. Không gửi lệnh điều khiển, không dùng broker thật.
export async function loopbackBroker() {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    const decoder = parser({ protocolVersion: 4 });
    decoder.on("error", () => socket.destroy());
    decoder.on("packet", (packet) => {
      if (packet.cmd === "connect")
        socket.write(
          generate({ cmd: "connack", sessionPresent: false, returnCode: 0 }),
        );
      if (packet.cmd === "subscribe")
        socket.write(
          generate({
            cmd: "suback",
            messageId: packet.messageId,
            granted: [1],
          }),
        );
      if (packet.cmd === "pingreq") socket.write(generate({ cmd: "pingresp" }));
    });
    socket.on("data", (bytes) => decoder.parse(bytes));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    port: server.address().port,
    publish(station, records) {
      for (const socket of sockets)
        socket.write(
          generate({
            cmd: "publish",
            topic: `publish/station/${station}`,
            payload: JSON.stringify({
              stationId: station,
              sensorRecords: records,
            }),
            qos: 0,
            retain: false,
            dup: false,
          }),
        );
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
