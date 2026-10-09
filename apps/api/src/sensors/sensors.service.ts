import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmPageDto, FarmRequestListDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { DevicesService } from '../devices/devices.service';
import { CreateSensorDto, SensorListDto, UpdateSensorDto } from './sensors.dto';
import { TestSensor, SensorChangeRequest, SensorCreationDetails, SensorDetails, SensorMetadataHistory } from './sensors.types';

export const SENSOR_LIMIT = 5000;
export const SENSOR_REQUEST_LIMIT = 2000;
export const SENSOR_HISTORY_LIMIT = 10000;

@Injectable()
export class SensorsService {
  private readonly sensors = new Map<string, TestSensor>();
  // Index hai tầng tương đương UNIQUE(device_id, data_stream_id); Inactive vẫn giữ cặp mã.
  private readonly streams = new Map<string, Map<string, string>>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, { value: SensorChangeRequest; version: number | null }>();
  private readonly changes: SensorMetadataHistory[] = [];

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}

  list(actorId: string, query: SensorListDto) {
    this.activeUser(actorId);
    const visibleDevices = new Map<string, boolean>();
    const q = query.q?.toLocaleLowerCase('vi');
    const items = [...this.sensors.values()].filter((sensor) => {
      if ((query.device_id && sensor.device_id !== query.device_id) || (query.status && sensor.status !== query.status)
        || (query.sensor_type && sensor.sensor_type !== query.sensor_type)) { return false; }
      if (!visibleDevices.has(sensor.device_id)) { visibleDevices.set(sensor.device_id, this.canReadDevice(actorId, sensor.device_id)); }
      return visibleDevices.get(sensor.device_id) && (!q || [sensor.name, sensor.data_stream_id].some((value) => value.toLocaleLowerCase('vi').includes(q)));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestSensor {
    this.activeUser(actorId);
    const sensor = this.getRecord(id);
    this.devices.get(actorId, sensor.device_id);
    return sensor;
  }

  getByStream(actorId: string, deviceId: string, dataStreamId: string): TestSensor {
    this.activeUser(actorId);
    this.devices.get(actorId, deviceId);
    return this.getRecordByStream(deviceId, dataStreamId);
  }

  // Lookup nội bộ cho telemetry sau này; HTTP phải dùng hàm có kiểm tra quyền hiện tại ở trên.
  getRecordByStream(deviceId: string, dataStreamId: string): TestSensor {
    const id = this.streams.get(deviceId)?.get(dataStreamId);
    if (!id) { throw new NotFoundException('Không tìm thấy cảm biến'); }
    return this.getRecord(id);
  }

  // Chỉ cho service nội bộ: controller phải dùng get/getByStream với kiểm tra quyền.
  getRecord(id: string): TestSensor {
    const sensor = this.sensors.get(id);
    if (!sensor) { throw new NotFoundException('Không tìm thấy cảm biến'); }
    return structuredClone(sensor);
  }

  history(actorId: string, id: string, query: FarmPageDto) {
    this.get(actorId, id);
    return this.page(this.changes.filter((change) => change.sensor_id === id), query);
  }

  create(actorId: string, input: CreateSensorDto): TestSensor {
    this.managementContext(actorId, input.device_id, 'Farmer');
    return this.commit(actorId, input.device_id, this.createDetails(input), null);
  }

  update(actorId: string, id: string, input: UpdateSensorDto): TestSensor {
    const sensor = this.getRecord(id);
    this.managementContext(actorId, sensor.device_id, 'Farmer');
    const changes = this.updateDetails(sensor, input);
    return this.commit(actorId, sensor.device_id, { ...sensor, ...changes }, sensor);
  }

  createRequest(actorId: string, input: CreateSensorDto): SensorChangeRequest {
    const { farm } = this.managementContext(actorId, input.device_id, 'Admin');
    const changes = this.createDetails(input);
    this.assertStreamAvailable(input.device_id, changes.data_stream_id);
    this.requireCapacity(true);
    return this.addRequest(actorId, input.device_id, farm.id, farm.owner_id, null, changes);
  }

  updateRequest(actorId: string, id: string, input: UpdateSensorDto): SensorChangeRequest {
    const sensor = this.getRecord(id);
    const { farm } = this.managementContext(actorId, sensor.device_id, 'Admin');
    const changes = this.updateDetails(sensor, input);
    if ([...this.requests.values()].some((entry) => entry.value.sensor_id === id && entry.value.status === 'Pending')) {
      throw new ConflictException('Cảm biến đã có đề xuất sửa Pending');
    }
    return this.addRequest(actorId, sensor.device_id, farm.id, farm.owner_id, sensor, changes);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((entry) => entry.value).filter((request) =>
      (actor.role === 'Admin' || request.owner_id === actorId) && (!query.status || request.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): SensorChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (actor.role !== 'Admin' && actorId !== request.owner_id) { throw new NotFoundException('Không tìm thấy đề xuất cảm biến'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): SensorChangeRequest {
    const entry = this.requireRequest(id);
    const request = entry.value;
    this.requireReviewer(actorId, request);
    const { farm } = this.managementContext(actorId, request.device_id, 'Farmer');
    if (farm.id !== request.farm_id || farm.owner_id !== request.owner_id) { throw new ConflictException('Farm/chủ đã thay đổi; cần đề xuất mới'); }
    if (this.activeUser(request.proposed_by).role !== 'Admin') { throw new ConflictException('Người đề xuất không còn là Admin'); }
    const before = request.sensor_id ? this.getRecord(request.sensor_id) : null;
    if (before && this.versions.get(before.id) !== entry.version) { throw new ConflictException('Cảm biến đã thay đổi; từ chối và lập đề xuất mới'); }
    const details = before ? { ...before, ...request.proposed_changes } : request.proposed_changes as SensorCreationDetails;
    // Dung lượng và lịch sử được kiểm tra trước commit; Accepted chỉ ghi sau khi cảm biến + audit đã thành công.
    const sensor = this.commit(actorId, request.device_id, details, before, request);
    entry.value = { ...request, sensor_id: sensor.id, status: 'Accepted', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString() };
    return structuredClone(entry.value);
  }

  reject(actorId: string, id: string, reason?: string): SensorChangeRequest {
    const entry = this.requireRequest(id);
    this.requireReviewer(actorId, entry.value);
    entry.value = { ...entry.value, status: 'Rejected', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString(), rejection_reason: reason ?? null };
    return structuredClone(entry.value);
  }

  private managementContext(actorId: string, deviceId: string, role: 'Admin' | 'Farmer') {
    const actor = this.activeUser(actorId);
    if (actor.role !== role) { throw new ForbiddenException(role === 'Admin' ? 'Chỉ Admin gửi đề xuất cảm biến' : 'Chỉ chủ Farmer được ghi trực tiếp cảm biến'); }
    const device = this.devices.getRecord(deviceId);
    const zone = this.zones.getRecord(device.zone_id);
    const farm = this.farms.getRecord(zone.farm_id);
    if (role === 'Farmer' && actor.id !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm được thay đổi cảm biến'); }
    if (this.activeUser(farm.owner_id).role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
    return { zone, farm };
  }

  private commit(actorId: string, deviceId: string, details: SensorCreationDetails, before: TestSensor | null, request?: SensorChangeRequest): TestSensor {
    this.requireCapacity(before === null);
    this.validateThresholds(details);
    if (!before) { this.assertStreamAvailable(deviceId, details.data_stream_id); }
    const id = before?.id ?? this.newSensorId();
    const sensor: TestSensor = { id, device_id: deviceId, data_stream_id: before?.data_stream_id ?? details.data_stream_id,
      sensor_type: before?.sensor_type ?? details.sensor_type, name: details.name, unit: details.unit,
      min_threshold: details.min_threshold, max_threshold: details.max_threshold, status: details.status };
    const version = (this.versions.get(id) ?? 0) + 1;
    const history: SensorMetadataHistory = { id: randomUUID(), sensor_id: id, action: before ? 'Update' : 'Create', actor_id: actorId,
      proposed_by: request?.proposed_by ?? null, request_id: request?.id ?? null, version,
      changed_at: new Date(Date.now()).toISOString(), before: before ? structuredClone(before) : null, after: structuredClone(sensor) };
    // Không await giữa kiểm tra unique và commit: hai approve cạnh tranh không đăng ký trùng cặp mã.
    // Đổi unit chỉ sửa metadata, không chuyển giá trị ngưỡng; snapshot giữ unit từng thời điểm.
    this.sensors.set(id, sensor);
    const deviceStreams = this.streams.get(deviceId) ?? new Map<string, string>();
    deviceStreams.set(sensor.data_stream_id, id);
    this.streams.set(deviceId, deviceStreams);
    this.versions.set(id, version);
    this.changes.push(history);
    return structuredClone(sensor);
  }

  private assertStreamAvailable(deviceId: string, streamId: string): void {
    if (this.streams.get(deviceId)?.has(streamId)) { throw new ConflictException('Device đã có data_stream_id này'); }
  }

  private newSensorId(): string {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      if (!this.sensors.has(id)) { return id; }
    }
    throw new ConflictException('Không thể sinh mã cảm biến duy nhất; thử lại');
  }

  private createDetails(input: CreateSensorDto): SensorCreationDetails {
    this.allowedFields(input, ['device_id', 'name', 'sensor_type', 'unit', 'data_stream_id', 'min_threshold', 'max_threshold', 'status']);
    const details: SensorCreationDetails = { name: input.name, unit: input.unit, sensor_type: input.sensor_type,
      data_stream_id: input.data_stream_id, min_threshold: input.min_threshold ?? null, max_threshold: input.max_threshold ?? null,
      status: input.status ?? 'Active' };
    this.validateThresholds(details);
    return details;
  }

  private updateDetails(sensor: TestSensor, input: UpdateSensorDto): Partial<SensorDetails> {
    this.allowedFields(input, ['name', 'unit', 'min_threshold', 'max_threshold', 'status']);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<SensorDetails>;
    // Giữ null tường minh và kiểm tra cặp sau ghép: PATCH một ngưỡng không được phá min < max.
    this.validateThresholds({ ...sensor, ...changes });
    if (!Object.entries(changes).some(([key, value]) => sensor[key as keyof SensorDetails] !== value)) {
      throw new BadRequestException('Cần ít nhất một thông tin cảm biến thực sự thay đổi');
    }
    return changes;
  }

  private validateThresholds(details: Pick<SensorDetails, 'min_threshold' | 'max_threshold'>): void {
    const min = details.min_threshold;
    const max = details.max_threshold;
    if (min === null && max === null) { return; }
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new BadRequestException('Hai ngưỡng phải cùng null hoặc cùng là số với min_threshold < max_threshold');
    }
  }

  private allowedFields(input: object, fields: string[]): void {
    if (Object.keys(input).some((key) => !fields.includes(key))) { throw new BadRequestException('Không sửa id, device_id, data_stream_id, sensor_type hoặc field ngoài contract'); }
  }

  private addRequest(actorId: string, deviceId: string, farmId: string, ownerId: string, sensor: TestSensor | null, changes: Partial<SensorCreationDetails>) {
    if (this.requests.size >= SENSOR_REQUEST_LIMIT) { throw new HttpException('Bộ nhớ đề xuất cảm biến đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const value: SensorChangeRequest = { id: randomUUID(), action: sensor ? 'Update' : 'Create', status: 'Pending', sensor_id: sensor?.id ?? null,
      device_id: deviceId, zone_id: this.devices.getRecord(deviceId).zone_id, farm_id: farmId, owner_id: ownerId, proposed_by: actorId, proposed_changes: structuredClone(changes),
      sensor_snapshot: sensor ? structuredClone(sensor) : null, created_at: new Date(Date.now()).toISOString(),
      resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, { value, version: sensor ? this.versions.get(sensor.id)! : null });
    return structuredClone(value);
  }

  private requireCapacity(creating: boolean): void {
    if (creating && this.sensors.size >= SENSOR_LIMIT) { throw new HttpException('Bộ nhớ cảm biến đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    if (this.changes.length >= SENSOR_HISTORY_LIMIT) { throw new HttpException('Bộ nhớ lịch sử cảm biến đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private requireRequest(id: string) {
    const entry = this.requests.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy đề xuất cảm biến'); }
    return entry;
  }

  private requireReviewer(actorId: string, request: SensorChangeRequest): void {
    const actor = this.activeUser(actorId);
    if (request.status !== 'Pending') { throw new ConflictException('Đề xuất cảm biến đã được xử lý'); }
    if (actor.role !== 'Farmer' || actorId !== request.owner_id) { throw new ForbiddenException('Chỉ chủ Farmer được duyệt/từ chối đề xuất cảm biến'); }
  }

  private canReadDevice(actorId: string, id: string): boolean {
    try { this.devices.get(actorId, id); return true; }
    catch (error) { if (error instanceof NotFoundException) { return false; } throw error; }
  }

  private activeUser(id: string): TestUser {
    const actor = this.users.findById(id);
    if (!actor || actor.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return actor;
  }

  private page<T>(items: T[], query: FarmPageDto) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
}
