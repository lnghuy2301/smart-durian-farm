import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MockUserStore } from '../auth/mock-user.store';
import { DevicesService } from '../devices/devices.service';
import { SensorsService } from '../sensors/sensors.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { FarmPageDto } from '../farms/farms.dto';
import { MqttConfig, MQTT_CONFIG } from './mqtt.config';
import { BrokerState, MqttTransport } from './mqtt.transport';
import { MqttProtocolError, parseIncoming, SensorReading, stationFromTopic } from './mqtt.protocol';

export const MQTT_DIAGNOSTIC_LIMIT = 200;
export interface RoutedReading extends SensorReading {
  sensor_id: string | null;
  accepted: boolean;
  reason: 'DEVICE_UNAVAILABLE' | 'SENSOR_UNAVAILABLE' | 'UNMAPPED_STREAM' | null;
  unit_mismatch: boolean;
}
export interface MessageDiagnostic {
  received_at: string;
  device_id: string | null;
  kind: 'Telemetry' | 'Ack' | 'Unknown' | 'Rejected';
  reason: string | null;
  readings: RoutedReading[];
  ack?: { task_id: number; action: 0 | 1 };
}
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private state: BrokerState;
  private readonly journal: MessageDiagnostic[] = [];
  private counts = { telemetry: 0, ack: 0, unknown: 0, rejected: 0, accepted_readings: 0, rejected_readings: 0, unit_mismatches: 0 };
  constructor(@Inject(MQTT_CONFIG) private readonly config: MqttConfig,
    @Inject(MqttTransport) private readonly transport: MqttTransport,
    @Inject(DevicesService) private readonly devices: DevicesService,
    @Inject(SensorsService) private readonly sensors: SensorsService,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
    @Inject(MockUserStore) private readonly users: MockUserStore) {
    this.state = { enabled: config.enabled, connected: false, subscribed: false, last_error: null };
  }
  onModuleInit(): void {
    this.transport.start({ state: (state) => { this.state = { ...state }; },
      message: (topic, payload, retained) => this.receive(topic, payload, retained) });
  }
  async onModuleDestroy(): Promise<void> { await this.transport.stop(); }

  brokerStatus(actorId: string) {
    const user = this.users.findById(actorId);
    if (!user || user.status !== 'Active' || user.role !== 'Admin') { throw new ForbiddenException('Chỉ Admin được xem chẩn đoán MQTT toàn hệ thống'); }
    return { ...this.state, ...this.counts, diagnostic_limit: MQTT_DIAGNOSTIC_LIMIT };
  }
  deviceStatus(actorId: string, deviceId: string, now = Date.now()) {
    const device = this.devices.get(actorId, deviceId);
    // Derive on read: no timer writes Online/Offline into Device.status and no telemetry payload timestamps.
    const recent = device.last_seen_at !== null && now - Date.parse(device.last_seen_at) < this.config.offlineAfterMs;
    return { device_id: device.id, status: device.status, last_seen_at: device.last_seen_at,
      connectivity: device.last_seen_at === null ? 'Unknown' : recent ? 'Online' : 'Offline',
      broker_connected: this.state.connected, receiver_ready: this.state.subscribed, offline_after_ms: this.config.offlineAfterMs };
  }
  messages(actorId: string, deviceId: string, page: FarmPageDto) {
    this.devices.get(actorId, deviceId);
    const items = this.journal.filter((event) => event.device_id === deviceId).reverse();
    return { items: structuredClone(items.slice(page.offset, page.offset + page.limit)), total: items.length, limit: page.limit, offset: page.offset };
  }
  // Not an HTTP injection endpoint. This method is called only by the transport/fake adapter in tests.
  private receive(topic: string, payload: Buffer, retained: boolean): void {
    const receivedAt = new Date(Date.now()).toISOString();
    let deviceId: string | null = null;
    try {
      const stationId = stationFromTopic(topic);
      try { deviceId = this.devices.getRecordByStationId(stationId).id; }
      catch (error) { if (error instanceof NotFoundException) { throw new MqttProtocolError('UNREGISTERED_STATION'); } throw error; }
      if (retained) { throw new MqttProtocolError('RETAINED_MESSAGE'); }
      const incoming = parseIncoming(topic, payload);
      if (incoming.kind === 'Unknown') {
        ++this.counts.unknown;
        this.append({ received_at: receivedAt, device_id: deviceId, kind: 'Unknown', reason: 'UNSUPPORTED_MESSAGE', readings: [] });
        return;
      }
      // v1.0 có taskId/action để domain correlate, chỉ xác nhận hardware nhận command.
      this.devices.recordSeen(deviceId, receivedAt);
      if (incoming.kind === 'Ack') {
        ++this.counts.ack;
        this.append({ received_at: receivedAt, device_id: deviceId, kind: 'Ack', reason: 'ACK_WITHOUT_TASK_HANDLER', readings: [],
          ack: { task_id: incoming.taskId, action: incoming.action } });
        return;
      }
      const device = this.devices.getRecord(deviceId);
      const readings = incoming.readings.map((reading): RoutedReading => {
        let sensor;
        try { sensor = this.sensors.getRecordByStream(deviceId!, reading.dataStreamId); }
        catch (error) { if (!(error instanceof NotFoundException)) { throw error; } }
        const reason = device.status !== 'Active' ? 'DEVICE_UNAVAILABLE' : !sensor ? 'UNMAPPED_STREAM' : sensor.status !== 'Active' ? 'SENSOR_UNAVAILABLE' : null;
        const unitMismatch = !!sensor && reading.receivedUnit !== sensor.unit;
        if (unitMismatch) { ++this.counts.unit_mismatches; }
        if (reason) { ++this.counts.rejected_readings; } else { ++this.counts.accepted_readings; }
        return { ...reading, sensor_id: sensor?.id ?? null, accepted: reason === null, reason, unit_mismatch: unitMismatch };
      });
      ++this.counts.telemetry;
      // Chỉ readings đã map/Active đi vào domain. Diagnostics giữ timestamp nhận cũ;
      // Telemetry tự lấy timestamp bước ghi, không dùng ACK hoặc đổi firmware.
      this.telemetry.record(deviceId, readings.filter((reading) => reading.accepted), receivedAt);
      // Bounded transport diagnostics only. This is not an IOT_TELEMETRIES persistence/domain model.
      this.append({ received_at: receivedAt, device_id: deviceId, kind: 'Telemetry', reason: null, readings });
    } catch (error) {
      ++this.counts.rejected;
      this.append({ received_at: receivedAt, device_id: deviceId, kind: 'Rejected',
        reason: error instanceof MqttProtocolError ? error.message : 'RECEIVER_ERROR', readings: [] });
    }
  }
  private append(event: MessageDiagnostic): void {
    if (this.journal.length === MQTT_DIAGNOSTIC_LIMIT) { this.journal.shift(); }
    this.journal.push(event);
    // Fixed diagnostic codes only: never dump payloads, credentials, station names or provider exception text.
    if (event.reason || event.readings.some((reading) => reading.reason || reading.unit_mismatch)) {
      this.logger.debug(event.reason ?? 'TELEMETRY_MAPPING_WARNING');
    }
  }
}
