export const MQTT_RETURN_TOPIC = 'publish/station/+';
export const MQTT_MAX_PAYLOAD_BYTES = 65536;
export const MQTT_MAX_SENSOR_RECORDS = 100;
const stationPattern = /^[A-Za-z0-9_-]{1,50}$/;

export class MqttProtocolError extends Error {}
export interface SensorReading { dataStreamId: string; value: number; receivedUnit: string; rawResult: string }
export type IncomingMessage =
  | { kind: 'Telemetry'; stationId: string; readings: SensorReading[] }
  | { kind: 'Ack'; stationId: string; taskId: number; action: 0 | 1 }
  | { kind: 'Unknown'; stationId: string };

export function stationFromTopic(topic: string): string {
  const match = /^publish\/station\/([A-Za-z0-9_-]{1,50})$/.exec(topic);
  if (!match) { throw new MqttProtocolError('INVALID_TOPIC'); }
  return match[1];
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hardwareNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function parseIncoming(topic: string, payload: Buffer): IncomingMessage {
  const stationId = stationFromTopic(topic);
  if (!payload.length || payload.length > MQTT_MAX_PAYLOAD_BYTES) { throw new MqttProtocolError('INVALID_PAYLOAD_SIZE'); }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)); }
  catch { throw new MqttProtocolError('INVALID_JSON_UTF8'); }
  if (!object(parsed)) { throw new MqttProtocolError('INVALID_MESSAGE_OBJECT'); }
  if ('stationId' in parsed && parsed.stationId !== stationId) { throw new MqttProtocolError('STATION_MISMATCH'); }
  // Telemetry takes priority. A broken sensorRecords packet must never fall through as an ACK.
  if ('sensorRecords' in parsed) {
    if (!Array.isArray(parsed.sensorRecords) || !parsed.sensorRecords.length || parsed.sensorRecords.length > MQTT_MAX_SENSOR_RECORDS) {
      throw new MqttProtocolError('INVALID_SENSOR_RECORDS');
    }
    const streams = new Set<string>();
    const readings = parsed.sensorRecords.map((record: unknown): SensorReading => {
      if (!object(record) || !hardwareNumber(record.dataStreamId) || typeof record.result !== 'string' || record.result.length > 128) {
        throw new MqttProtocolError('INVALID_SENSOR_RECORD');
      }
      const id = String(record.dataStreamId);
      if (streams.has(id)) { throw new MqttProtocolError('DUPLICATE_STREAM'); }
      streams.add(id);
      // Decimal grammar matches verified firmware strings; preserve unit spelling, never convert C/%/%rH.
      const match = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+([^\s]+)\s*$/.exec(record.result);
      if (!match || !Number.isFinite(Number(match[1])) || match[2].length > 16
        || Array.from(match[2]).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
        throw new MqttProtocolError('INVALID_RESULT');
      }
      return { dataStreamId: id, value: Number(match[1]), receivedUnit: match[2], rawResult: record.result };
    });
    return { kind: 'Telemetry', stationId, readings };
  }
  if (parsed.status === 'ACK') {
    // Contract v1.0: ACK xác nhận nhận lệnh, không phải đo trạng thái relay.
    // Giữ ID/action để domain đối chiếu cùng Device; ACK cũ không thể xác nhận task.
    if (!hardwareNumber(parsed.taskId) || (parsed.action !== 0 && parsed.action !== 1)) {
      throw new MqttProtocolError('INVALID_ACK');
    }
    return { kind: 'Ack', stationId, taskId: parsed.taskId, action: parsed.action };
  }
  return { kind: 'Unknown', stationId };
}

export interface ControlTarget { taskId: number; taskingCapabilityId: number }
export interface ControlCommand {
  targets: ControlTarget[];
  taskingParameters: { actionType: 'control'; action: 0 | 1 };
}
export function buildControlPublication(stationId: string, targets: ControlTarget[], action: 0 | 1) {
  if (!stationPattern.test(stationId) || !Array.isArray(targets) || targets.length < 1 || targets.length > 100 || ![0, 1].includes(action)) {
    throw new MqttProtocolError('INVALID_COMMAND');
  }
  const taskIds = new Set<number>();
  const capabilityIds = new Set<number>();
  for (const target of targets) {
    if (!object(target) || !hardwareNumber(target.taskId) || !hardwareNumber(target.taskingCapabilityId)
      || taskIds.has(target.taskId) || capabilityIds.has(target.taskingCapabilityId)) { throw new MqttProtocolError('INVALID_TARGET'); }
    taskIds.add(target.taskId); capabilityIds.add(target.taskingCapabilityId);
  }
  // Copy only verified fields. IDs must come from future task service and configured Actuator metadata.
  const command: ControlCommand = { targets: targets.map(({ taskId, taskingCapabilityId }) => ({ taskId, taskingCapabilityId })),
    taskingParameters: { actionType: 'control', action } };
  return { topic: `subscribe/station/${stationId}`, payload: JSON.stringify(command) };
}
