import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmPageDto, FarmRequestListDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { TreesService } from '../trees/trees.service';
import { CreateDeviceDto, DeviceListDto, UpdateDeviceDto } from './devices.dto';
import { TestDevice, DeviceChangeRequest, DeviceCreationDetails, DeviceDetails, DeviceMetadataHistory } from './devices.types';

export const DEVICE_LIMIT = 1000;
export const DEVICE_REQUEST_LIMIT = 2000;
export const DEVICE_HISTORY_LIMIT = 10000;

@Injectable()
export class DevicesService {
  private readonly devices = new Map<string, TestDevice>();
  // Index station_id phân biệt chữ hoa/thường đúng mã firmware, không gộp với UUID.
  private readonly stationIds = new Map<string, string>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, { value: DeviceChangeRequest; version: number | null }>();
  private readonly changes: DeviceMetadataHistory[] = [];

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(TreesService) private readonly trees: TreesService,
  ) {}

  list(actorId: string, query: DeviceListDto) {
    this.activeUser(actorId);
    const visibleZones = new Map<string, boolean>();
    const q = query.q?.toLocaleLowerCase('vi');
    const items = [...this.devices.values()].filter((device) => {
      if ((query.zone_id && device.zone_id !== query.zone_id) || (query.status && device.status !== query.status)) { return false; }
      if (!visibleZones.has(device.zone_id)) { visibleZones.set(device.zone_id, this.canReadZone(actorId, device.zone_id)); }
      return visibleZones.get(device.zone_id) && (!q || device.station_id.toLocaleLowerCase('vi').includes(q));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestDevice {
    this.activeUser(actorId);
    const device = this.getRecord(id);
    this.zones.get(actorId, device.zone_id);
    return device;
  }

  getByStationId(actorId: string, stationId: string): TestDevice {
    this.activeUser(actorId);
    return this.get(actorId, this.getRecordByStationId(stationId).id);
  }

  // Chỉ lookup nội bộ cho MQTT sau này: station từ topic -> UUID, không cấp quyền HTTP/authentication.
  getRecordByStationId(stationId: string): TestDevice {
    const id = this.stationIds.get(stationId);
    if (!id) { throw new NotFoundException('Không tìm thấy thiết bị'); }
    return this.getRecord(id);
  }

  affectedTrees(actorId: string, id: string, query: FarmPageDto) {
    const device = this.get(actorId, id);
    // Quan hệ qua Zone chung, không có TREES.device_id hoặc danh sách cây cố định để ghi đồng bộ.
    // Trả cây hiện tại (kể cả Dead/Removed) để mô tả phạm vi; không thực thi điều khiển hardware.
    return this.trees.list(actorId, { ...query, zone_id: device.zone_id });
  }

  // Chỉ cho service nội bộ: controller phải dùng get/getByStationId với kiểm tra quyền.
  getRecord(id: string): TestDevice {
    const device = this.devices.get(id);
    if (!device) { throw new NotFoundException('Không tìm thấy thiết bị'); }
    return structuredClone(device);
  }

  // Chỉ receiver nội bộ gọi với thời điểm server nhận, không nhận last_seen_at từ PATCH của client.
  // Presence không đổi version metadata: telemetry mới không làm đề xuất Admin bị stale.
  recordSeen(id: string, receivedAt: string): void {
    const device = this.getRecord(id);
    const time = Date.parse(receivedAt);
    if (!Number.isFinite(time)) { throw new BadRequestException('Thời điểm nhận MQTT không hợp lệ'); }
    if (!device.last_seen_at || time > Date.parse(device.last_seen_at)) {
      this.devices.set(id, { ...device, last_seen_at: new Date(time).toISOString() });
    }
  }

  history(actorId: string, id: string, query: FarmPageDto) {
    this.get(actorId, id);
    return this.page(this.changes.filter((change) => change.device_id === id), query);
  }

  create(actorId: string, input: CreateDeviceDto): TestDevice {
    this.managementContext(actorId, input.zone_id, 'Farmer');
    return this.commit(actorId, input.zone_id, this.createDetails(input), null);
  }

  update(actorId: string, id: string, input: UpdateDeviceDto): TestDevice {
    const device = this.getRecord(id);
    this.managementContext(actorId, device.zone_id, 'Farmer');
    const changes = this.updateDetails(device, input);
    return this.commit(actorId, device.zone_id, { ...device, ...changes }, device);
  }

  createRequest(actorId: string, input: CreateDeviceDto): DeviceChangeRequest {
    const { farm } = this.managementContext(actorId, input.zone_id, 'Admin');
    const changes = this.createDetails(input);
    this.assertStationAvailable(changes.station_id);
    this.requireCapacity(true);
    return this.addRequest(actorId, input.zone_id, farm.id, farm.owner_id, null, changes);
  }

  updateRequest(actorId: string, id: string, input: UpdateDeviceDto): DeviceChangeRequest {
    const device = this.getRecord(id);
    const { farm } = this.managementContext(actorId, device.zone_id, 'Admin');
    const changes = this.updateDetails(device, input);
    if ([...this.requests.values()].some((entry) => entry.value.device_id === id && entry.value.status === 'Pending')) {
      throw new ConflictException('Thiết bị đã có đề xuất sửa Pending');
    }
    return this.addRequest(actorId, device.zone_id, farm.id, farm.owner_id, device, changes);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((entry) => entry.value).filter((request) =>
      (actor.role === 'Admin' || request.owner_id === actorId) && (!query.status || request.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): DeviceChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (actor.role !== 'Admin' && actorId !== request.owner_id) { throw new NotFoundException('Không tìm thấy đề xuất thiết bị'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): DeviceChangeRequest {
    const entry = this.requireRequest(id);
    const request = entry.value;
    this.requireReviewer(actorId, request);
    const { farm } = this.managementContext(actorId, request.zone_id, 'Farmer');
    if (farm.id !== request.farm_id || farm.owner_id !== request.owner_id) { throw new ConflictException('Farm/chủ đã thay đổi; cần đề xuất mới'); }
    if (this.activeUser(request.proposed_by).role !== 'Admin') { throw new ConflictException('Người đề xuất không còn là Admin'); }
    const before = request.device_id ? this.getRecord(request.device_id) : null;
    if (before && this.versions.get(before.id) !== entry.version) { throw new ConflictException('Thiết bị đã thay đổi; từ chối và lập đề xuất mới'); }
    const details = before ? { ...before, ...request.proposed_changes } : request.proposed_changes as DeviceCreationDetails;
    // Dung lượng và lịch sử được kiểm tra trước commit; Accepted chỉ ghi sau khi thiết bị + audit đã thành công.
    const device = this.commit(actorId, request.zone_id, details, before, request);
    entry.value = { ...request, device_id: device.id, status: 'Accepted', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString() };
    return structuredClone(entry.value);
  }

  reject(actorId: string, id: string, reason?: string): DeviceChangeRequest {
    const entry = this.requireRequest(id);
    this.requireReviewer(actorId, entry.value);
    entry.value = { ...entry.value, status: 'Rejected', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString(), rejection_reason: reason ?? null };
    return structuredClone(entry.value);
  }

  private managementContext(actorId: string, zoneId: string, role: 'Admin' | 'Farmer') {
    const actor = this.activeUser(actorId);
    if (actor.role !== role) { throw new ForbiddenException(role === 'Admin' ? 'Chỉ Admin gửi đề xuất thiết bị' : 'Chỉ chủ Farmer được ghi trực tiếp thiết bị'); }
    const zone = this.zones.getRecord(zoneId);
    const farm = this.farms.getRecord(zone.farm_id);
    if (role === 'Farmer' && actor.id !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm được thay đổi thiết bị'); }
    if (this.activeUser(farm.owner_id).role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
    return { zone, farm };
  }

  private commit(actorId: string, zoneId: string, details: DeviceCreationDetails, before: TestDevice | null, request?: DeviceChangeRequest): TestDevice {
    this.requireCapacity(before === null);
    if (!before) { this.assertStationAvailable(details.station_id); }
    const id = before?.id ?? this.newDeviceId();
    const device: TestDevice = { id, zone_id: zoneId, station_id: before?.station_id ?? details.station_id,
      installed_at: details.installed_at, cost: details.cost, status: details.status, last_seen_at: before?.last_seen_at ?? null };
    const version = (this.versions.get(id) ?? 0) + 1;
    const history: DeviceMetadataHistory = { id: randomUUID(), device_id: id, action: before ? 'Update' : 'Create', actor_id: actorId,
      proposed_by: request?.proposed_by ?? null, request_id: request?.id ?? null, version,
      changed_at: new Date(Date.now()).toISOString(), before: before ? structuredClone(before) : null, after: structuredClone(device) };
    // Kiểm tra unique/capacity trước ghi. Không await giữa kiểm tra/commit; hai approve không đăng ký cùng trạm.
    // Inactive giữ bản ghi và index station_id, nên không thể đăng ký lại trạm để lách Zone bất biến.
    this.devices.set(id, device);
    this.stationIds.set(device.station_id, id);
    this.versions.set(id, version);
    this.changes.push(history);
    return structuredClone(device);
  }

  private assertStationAvailable(stationId: string): void {
    if (this.stationIds.has(stationId)) { throw new ConflictException('station_id đã được đăng ký'); }
  }

  private newDeviceId(): string {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      if (!this.devices.has(id)) { return id; }
    }
    throw new ConflictException('Không thể sinh mã thiết bị duy nhất; thử lại');
  }

  private createDetails(input: CreateDeviceDto): DeviceCreationDetails {
    this.allowedFields(input, ['zone_id', 'station_id', 'installed_at', 'cost', 'status']);
    return { station_id: input.station_id, installed_at: this.date(input.installed_at), cost: input.cost, status: input.status ?? 'Active' };
  }

  private updateDetails(device: TestDevice, input: UpdateDeviceDto): Partial<DeviceDetails> {
    this.allowedFields(input, ['installed_at', 'cost', 'status']);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<DeviceDetails>;
    if (changes.installed_at !== undefined) { changes.installed_at = this.date(changes.installed_at); }
    if (!Object.entries(changes).some(([key, value]) => device[key as keyof DeviceDetails] !== value)) {
      throw new BadRequestException('Cần ít nhất một thông tin thiết bị thực sự thay đổi');
    }
    return changes;
  }

  private allowedFields(input: object, fields: string[]): void {
    if (Object.keys(input).some((key) => !fields.includes(key))) { throw new BadRequestException('Không sửa id, station_id, zone_id hoặc field ngoài contract'); }
  }

  private date(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) { throw new BadRequestException('installed_at không hợp lệ'); }
    return new Date(parsed).toISOString();
  }

  private addRequest(actorId: string, zoneId: string, farmId: string, ownerId: string, device: TestDevice | null, changes: Partial<DeviceCreationDetails>) {
    if (this.requests.size >= DEVICE_REQUEST_LIMIT) { throw new HttpException('Bộ nhớ đề xuất thiết bị đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const value: DeviceChangeRequest = { id: randomUUID(), action: device ? 'Update' : 'Create', status: 'Pending', device_id: device?.id ?? null,
      zone_id: zoneId, farm_id: farmId, owner_id: ownerId, proposed_by: actorId, proposed_changes: structuredClone(changes),
      device_snapshot: device ? structuredClone(device) : null, created_at: new Date(Date.now()).toISOString(),
      resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, { value, version: device ? this.versions.get(device.id)! : null });
    return structuredClone(value);
  }

  private requireCapacity(creating: boolean): void {
    if (creating && this.devices.size >= DEVICE_LIMIT) { throw new HttpException('Bộ nhớ thiết bị đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    if (this.changes.length >= DEVICE_HISTORY_LIMIT) { throw new HttpException('Bộ nhớ lịch sử thiết bị đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private requireRequest(id: string) {
    const entry = this.requests.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy đề xuất thiết bị'); }
    return entry;
  }

  private requireReviewer(actorId: string, request: DeviceChangeRequest): void {
    const actor = this.activeUser(actorId);
    if (request.status !== 'Pending') { throw new ConflictException('Đề xuất thiết bị đã được xử lý'); }
    if (actor.role !== 'Farmer' || actorId !== request.owner_id) { throw new ForbiddenException('Chỉ chủ Farmer được duyệt/từ chối đề xuất thiết bị'); }
  }

  private canReadZone(actorId: string, id: string): boolean {
    try { this.zones.get(actorId, id); return true; }
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
