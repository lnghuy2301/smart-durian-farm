import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmPageDto, FarmRequestListDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { DevicesService } from '../devices/devices.service';
import { CreateActuatorDto, ActuatorListDto, UpdateActuatorDto, MAX_CAPABILITY_ID } from './actuators.dto';
import { TestActuator, ActuatorChangeRequest, ActuatorCreationDetails, ActuatorDetails, ActuatorMetadataHistory } from './actuators.types';

export const ACTUATOR_LIMIT = 5000;
export const ACTUATOR_REQUEST_LIMIT = 2000;
export const ACTUATOR_HISTORY_LIMIT = 10000;

@Injectable()
export class ActuatorsService {
  private readonly actuators = new Map<string, TestActuator>();
  // Index hai tầng tương đương UNIQUE(device_id, capability_id); Inactive vẫn giữ cặp mã.
  private readonly capabilities = new Map<string, Map<number, string>>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, { value: ActuatorChangeRequest; version: number | null }>();
  private readonly changes: ActuatorMetadataHistory[] = [];

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}

  list(actorId: string, query: ActuatorListDto) {
    this.activeUser(actorId);
    const visibleDevices = new Map<string, boolean>();
    const q = query.q?.toLocaleLowerCase('vi');
    const items = [...this.actuators.values()].filter((actuator) => {
      if ((query.device_id && actuator.device_id !== query.device_id) || (query.status && actuator.status !== query.status)
        || (query.purpose && actuator.purpose !== query.purpose)) { return false; }
      if (!visibleDevices.has(actuator.device_id)) { visibleDevices.set(actuator.device_id, this.canReadDevice(actorId, actuator.device_id)); }
      return visibleDevices.get(actuator.device_id) && (!q || [actuator.name, actuator.capability_id].some((value) => String(value).toLocaleLowerCase('vi').includes(q)));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestActuator {
    this.activeUser(actorId);
    const actuator = this.getRecord(id);
    this.devices.get(actorId, actuator.device_id);
    return actuator;
  }

  getByCapability(actorId: string, deviceId: string, capabilityId: number): TestActuator {
    this.activeUser(actorId);
    this.devices.get(actorId, deviceId);
    return this.getRecordByCapability(deviceId, capabilityId);
  }

  // Lookup nội bộ cho MQTT sau này; HTTP phải dùng hàm có kiểm tra quyền hiện tại ở trên.
  getRecordByCapability(deviceId: string, capabilityId: number): TestActuator {
    this.assertValidCapability(capabilityId);
    const id = this.capabilities.get(deviceId)?.get(capabilityId);
    if (!id) { throw new NotFoundException('Không tìm thấy thiết bị chấp hành'); }
    return this.getRecord(id);
  }

  // Chỉ cho service nội bộ: controller phải dùng get/getByCapability với kiểm tra quyền.
  getRecord(id: string): TestActuator {
    const actuator = this.actuators.get(id);
    if (!actuator) { throw new NotFoundException('Không tìm thấy thiết bị chấp hành'); }
    return structuredClone(actuator);
  }

  history(actorId: string, id: string, query: FarmPageDto) {
    this.get(actorId, id);
    return this.page(this.changes.filter((change) => change.actuator_id === id), query);
  }

  create(actorId: string, input: CreateActuatorDto): TestActuator {
    this.managementContext(actorId, input.device_id, 'Farmer');
    return this.commit(actorId, input.device_id, this.createDetails(input), null);
  }

  update(actorId: string, id: string, input: UpdateActuatorDto): TestActuator {
    const actuator = this.getRecord(id);
    this.managementContext(actorId, actuator.device_id, 'Farmer');
    const changes = this.updateDetails(actuator, input);
    return this.commit(actorId, actuator.device_id, { ...actuator, ...changes }, actuator);
  }

  createRequest(actorId: string, input: CreateActuatorDto): ActuatorChangeRequest {
    const { farm } = this.managementContext(actorId, input.device_id, 'Admin');
    const changes = this.createDetails(input);
    this.assertCapabilityAvailable(input.device_id, changes.capability_id);
    this.requireCapacity(true);
    return this.addRequest(actorId, input.device_id, farm.id, farm.owner_id, null, changes);
  }

  updateRequest(actorId: string, id: string, input: UpdateActuatorDto): ActuatorChangeRequest {
    const actuator = this.getRecord(id);
    const { farm } = this.managementContext(actorId, actuator.device_id, 'Admin');
    const changes = this.updateDetails(actuator, input);
    if ([...this.requests.values()].some((entry) => entry.value.actuator_id === id && entry.value.status === 'Pending')) {
      throw new ConflictException('Thiết bị chấp hành đã có đề xuất sửa Pending');
    }
    return this.addRequest(actorId, actuator.device_id, farm.id, farm.owner_id, actuator, changes);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((entry) => entry.value).filter((request) =>
      (actor.role === 'Admin' || request.owner_id === actorId) && (!query.status || request.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): ActuatorChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (actor.role !== 'Admin' && actorId !== request.owner_id) { throw new NotFoundException('Không tìm thấy đề xuất thiết bị chấp hành'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): ActuatorChangeRequest {
    const entry = this.requireRequest(id);
    const request = entry.value;
    this.requireReviewer(actorId, request);
    const { farm } = this.managementContext(actorId, request.device_id, 'Farmer');
    if (farm.id !== request.farm_id || farm.owner_id !== request.owner_id) { throw new ConflictException('Farm/chủ đã thay đổi; cần đề xuất mới'); }
    if (this.activeUser(request.proposed_by).role !== 'Admin') { throw new ConflictException('Người đề xuất không còn là Admin'); }
    const before = request.actuator_id ? this.getRecord(request.actuator_id) : null;
    if (before && this.versions.get(before.id) !== entry.version) { throw new ConflictException('Thiết bị chấp hành đã thay đổi; từ chối và lập đề xuất mới'); }
    const details = before ? { ...before, ...request.proposed_changes } : request.proposed_changes as ActuatorCreationDetails;
    // Dung lượng và lịch sử được kiểm tra trước commit; Accepted chỉ ghi sau khi thiết bị chấp hành + audit đã thành công.
    const actuator = this.commit(actorId, request.device_id, details, before, request);
    entry.value = { ...request, actuator_id: actuator.id, status: 'Accepted', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString() };
    return structuredClone(entry.value);
  }

  reject(actorId: string, id: string, reason?: string): ActuatorChangeRequest {
    const entry = this.requireRequest(id);
    this.requireReviewer(actorId, entry.value);
    entry.value = { ...entry.value, status: 'Rejected', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString(), rejection_reason: reason ?? null };
    return structuredClone(entry.value);
  }

  private managementContext(actorId: string, deviceId: string, role: 'Admin' | 'Farmer') {
    const actor = this.activeUser(actorId);
    if (actor.role !== role) { throw new ForbiddenException(role === 'Admin' ? 'Chỉ Admin gửi đề xuất thiết bị chấp hành' : 'Chỉ chủ Farmer được ghi trực tiếp thiết bị chấp hành'); }
    const device = this.devices.getRecord(deviceId);
    const zone = this.zones.getRecord(device.zone_id);
    const farm = this.farms.getRecord(zone.farm_id);
    if (role === 'Farmer' && actor.id !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm được thay đổi thiết bị chấp hành'); }
    if (this.activeUser(farm.owner_id).role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
    return { zone, farm };
  }

  private commit(actorId: string, deviceId: string, details: ActuatorCreationDetails, before: TestActuator | null, request?: ActuatorChangeRequest): TestActuator {
    this.requireCapacity(before === null);
    if (!before) { this.assertCapabilityAvailable(deviceId, details.capability_id); }
    const id = before?.id ?? this.newActuatorId();
    const actuator: TestActuator = { id, device_id: deviceId, capability_id: before?.capability_id ?? details.capability_id,
      purpose: before?.purpose ?? details.purpose, name: details.name, status: details.status };
    const version = (this.versions.get(id) ?? 0) + 1;
    const history: ActuatorMetadataHistory = { id: randomUUID(), actuator_id: id, action: before ? 'Update' : 'Create', actor_id: actorId,
      proposed_by: request?.proposed_by ?? null, request_id: request?.id ?? null, version,
      changed_at: new Date(Date.now()).toISOString(), before: before ? structuredClone(before) : null, after: structuredClone(actuator) };
    // Không await giữa kiểm tra unique và commit: hai approve cạnh tranh không đăng ký trùng cặp mã.
    // Shared là phân loại metadata bơm chung; commit không phát lệnh MQTT hoặc đổi trạng thái relay.
    this.actuators.set(id, actuator);
    const deviceCapabilities = this.capabilities.get(deviceId) ?? new Map<number, string>();
    deviceCapabilities.set(actuator.capability_id, id);
    this.capabilities.set(deviceId, deviceCapabilities);
    this.versions.set(id, version);
    this.changes.push(history);
    return structuredClone(actuator);
  }

  private assertCapabilityAvailable(deviceId: string, capabilityId: number): void {
    if (this.capabilities.get(deviceId)?.has(capabilityId)) { throw new ConflictException('Device đã có capability_id này'); }
  }

  private newActuatorId(): string {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      if (!this.actuators.has(id)) { return id; }
    }
    throw new ConflictException('Không thể sinh mã thiết bị chấp hành duy nhất; thử lại');
  }

  private createDetails(input: CreateActuatorDto): ActuatorCreationDetails {
    this.allowedFields(input, ['device_id', 'name', 'purpose', 'capability_id', 'status']);
    this.assertValidCapability(input.capability_id);
    return { name: input.name, purpose: input.purpose, capability_id: input.capability_id, status: input.status ?? 'Active' };
  }

  private updateDetails(actuator: TestActuator, input: UpdateActuatorDto): Partial<ActuatorDetails> {
    this.allowedFields(input, ['name', 'status']);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<ActuatorDetails>;
    if (!Object.entries(changes).some(([key, value]) => actuator[key as keyof ActuatorDetails] !== value)) {
      throw new BadRequestException('Cần ít nhất một thông tin thiết bị chấp hành thực sự thay đổi');
    }
    return changes;
  }

  private assertValidCapability(capabilityId: number): void {
    if (!Number.isSafeInteger(capabilityId) || capabilityId < 1 || capabilityId > MAX_CAPABILITY_ID) {
      throw new BadRequestException('capability_id phải là số nguyên dương trong miền JSON number chính xác');
    }
  }

  private allowedFields(input: object, fields: string[]): void {
    if (Object.keys(input).some((key) => !fields.includes(key))) {
      throw new BadRequestException('Không sửa id, device_id, capability_id, purpose hoặc field ngoài contract');
    }
  }

  private addRequest(actorId: string, deviceId: string, farmId: string, ownerId: string, actuator: TestActuator | null, changes: Partial<ActuatorCreationDetails>) {
    if (this.requests.size >= ACTUATOR_REQUEST_LIMIT) { throw new HttpException('Bộ nhớ đề xuất thiết bị chấp hành đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const value: ActuatorChangeRequest = { id: randomUUID(), action: actuator ? 'Update' : 'Create', status: 'Pending', actuator_id: actuator?.id ?? null,
      device_id: deviceId, zone_id: this.devices.getRecord(deviceId).zone_id, farm_id: farmId, owner_id: ownerId, proposed_by: actorId, proposed_changes: structuredClone(changes),
      actuator_snapshot: actuator ? structuredClone(actuator) : null, created_at: new Date(Date.now()).toISOString(),
      resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, { value, version: actuator ? this.versions.get(actuator.id)! : null });
    return structuredClone(value);
  }

  private requireCapacity(creating: boolean): void {
    if (creating && this.actuators.size >= ACTUATOR_LIMIT) { throw new HttpException('Bộ nhớ thiết bị chấp hành đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    if (this.changes.length >= ACTUATOR_HISTORY_LIMIT) { throw new HttpException('Bộ nhớ lịch sử thiết bị chấp hành đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private requireRequest(id: string) {
    const entry = this.requests.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy đề xuất thiết bị chấp hành'); }
    return entry;
  }

  private requireReviewer(actorId: string, request: ActuatorChangeRequest): void {
    const actor = this.activeUser(actorId);
    if (request.status !== 'Pending') { throw new ConflictException('Đề xuất thiết bị chấp hành đã được xử lý'); }
    if (actor.role !== 'Farmer' || actorId !== request.owner_id) { throw new ForbiddenException('Chỉ chủ Farmer được duyệt/từ chối đề xuất thiết bị chấp hành'); }
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
