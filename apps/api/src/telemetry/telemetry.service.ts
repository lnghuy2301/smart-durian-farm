import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MockUserStore } from '../auth/mock-user.store';
import { MockZoneAssignmentStore } from '../assignments/mock-zone-assignment.store';
import { assignmentActive } from '../assignments/assignment-policy';
import { DevicesService } from '../devices/devices.service';
import { FarmsService } from '../farms/farms.service';
import { ZonesService } from '../zones/zones.service';
import { SensorsService } from '../sensors/sensors.service';
import { SensorReading } from '../mqtt/mqtt.protocol';
import { TelemetryHistoryDto, TelemetryLatestDto } from './telemetry.dto';
import { TELEMETRY_READING_LIMIT, TelemetryStore } from './telemetry.store';
import { TelemetryRecord } from './telemetry.types';

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(TelemetryStore) private readonly store: TelemetryStore,
    @Inject(DevicesService) private readonly devices: DevicesService,
    @Inject(SensorsService) private readonly sensors: SensorsService,
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(MockZoneAssignmentStore) private readonly assignments: MockZoneAssignmentStore,
  ) {}

  // Nội bộ receiver, không có HTTP nhập. measuredAt lấy từ lúc backend nhận packet,
  // không phải timestamp đo thực ESP32. Validate toàn batch trước ghi, không lưu nửa packet.
  record(deviceId: string, readings: SensorReading[], measuredAt: string): void {
    if (!readings.length) { return; }
    const device = this.devices.getRecord(deviceId);
    if (device.status !== 'Active') { return; }
    if (!Number.isFinite(Date.parse(measuredAt))) { throw new BadRequestException('Thời gian đọc MQTT không hợp lệ'); }
    const streams = new Set<string>();
    for (const reading of readings) {
      const sensor = this.sensors.getRecordByStream(deviceId, reading.dataStreamId);
      if (sensor.status !== 'Active' || streams.has(reading.dataStreamId)
        || !Number.isFinite(reading.value) || !reading.receivedUnit.length || reading.receivedUnit.length > 16) {
        throw new BadRequestException('Reading nội bộ không hợp lệ');
      }
      streams.add(reading.dataStreamId);
    }
    // Hai mốc server khác nhau: packet arrival và bước ghi RAM. Có thể bằng nhau ở độ phân giải ms.
    // Không đặt timer 15s: mỗi packet hợp lệ đều lưu, firmware/operator quyết định chu kỳ gửi.
    const receivedAt = new Date(Date.now()).toISOString();
    const records = readings.map((reading): TelemetryRecord => ({
      _id: new ObjectId().toHexString(), device_id: deviceId, data_stream_id: reading.dataStreamId,
      measured_at: new Date(measuredAt).toISOString(), received_at: receivedAt, value: reading.value, unit: reading.receivedUnit,
    }));
    this.store.append(records);
  }

  latest(actorId: string, deviceId: string, query: TelemetryLatestDto) {
    const visible = this.visibleRecords(actorId, deviceId, query);
    const streams = new Set<string>();
    const latest = visible.filter((record) => {
      if (streams.has(record.data_stream_id)) { return false; }
      streams.add(record.data_stream_id);
      return true;
    });
    return this.page(deviceId, latest, query);
  }

  history(actorId: string, deviceId: string, query: TelemetryHistoryDto) {
    const records = this.visibleRecords(actorId, deviceId, query);
    const from = query.from === undefined ? -Infinity : Date.parse(query.from);
    const to = query.to === undefined ? Infinity : Date.parse(query.to);
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
      throw new BadRequestException('Khoảng from/to phải hợp lệ và from < to');
    }
    return this.page(deviceId, records.filter((record) => {
      const time = Date.parse(record.received_at);
      return time >= from && time < to;
    }), query);
  }

  private visibleRecords(actorId: string, deviceId: string, query: TelemetryLatestDto): TelemetryRecord[] {
    // Quyền hiện tại được kiểm tra cả khi store rỗng/metadata Inactive.
    // Hết assignment bị chặn cả latest/history; store không xóa lịch sử khi hết phân công.
    const device = this.devices.get(actorId, deviceId);
    const actor = this.users.findById(actorId)!;
    const farm = this.farms.getRecord(this.zones.getRecord(device.zone_id).farm_id);
    let start = -Infinity, end = Infinity;
    if (actor.role === 'Farmer' && actor.id !== farm.owner_id) {
      const current = this.assignments.list().find(({ assignment }) => assignment.user_id === actorId
        && assignment.zone_id === device.zone_id && assignmentActive(assignment));
      if (!current) { throw new NotFoundException('Không có phân công đang hiệu lực tại Device'); }
      start = Date.parse(current.assignment.start_date);
      end = current.assignment.end_date === null ? Infinity : Date.parse(current.assignment.end_date);
    }
    // Lọc quyền trước latest/total/pagination: assignment mới không mở lại các readings cũ.
    return this.store.newestFirst().filter((record) => record.device_id === deviceId
      && (!query.data_stream_id || record.data_stream_id === query.data_stream_id)
      && Date.parse(record.received_at) >= start && Date.parse(record.received_at) < end);
  }

  private page(deviceId: string, items: TelemetryRecord[], query: TelemetryLatestDto) {
    return { device_id: deviceId, items: items.slice(query.offset, query.offset + query.limit), total: items.length,
      limit: query.limit, offset: query.offset,
      storage: { mode: 'Memory', capacity_readings: TELEMETRY_READING_LIMIT, eviction: 'OldestInserted' } };
  }
}
