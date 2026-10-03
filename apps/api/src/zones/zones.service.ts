import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmAreaBudget } from '../farms/farm-area-budget';
import { FarmRequestListDto } from '../farms/farms.dto';
import { TestFarm } from '../farms/farms.types';
import { StandardsService } from '../standards/standards.service';
import { CreateZoneDto, UpdateZoneDto, ZoneDetailsDto, ZoneListDto } from './zones.dto';
import { TestZone, ZoneChangeRequest } from './zones.types';
import { MockZoneAssignmentStore } from '../assignments/mock-zone-assignment.store';

@Injectable()
export class ZonesService {
  private readonly zones = new Map<string, TestZone>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, { value: ZoneChangeRequest; version: number | null }>();

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(FarmAreaBudget) private readonly areaBudget: FarmAreaBudget,
    @Inject(StandardsService) private readonly standards: StandardsService,
    @Inject(MockZoneAssignmentStore) private readonly assignments: MockZoneAssignmentStore,
  ) {}

  list(actorId: string, query: ZoneListDto) {
    const actor = this.activeUser(actorId);
    // Kiểm tra quyền từng Farm, độc lập với pagination của endpoint danh sách Farm.
    const items = [...this.zones.values()].filter((zone) => {
      if (query.farm_id && zone.farm_id !== query.farm_id) { return false; }
      const visible = this.canReadFarm(actorId, zone.farm_id)
        || (actor.role === 'Farmer' && this.assignments.hasActive(actorId, zone.id));
      return visible && (!query.q || zone.zone_name.toLocaleLowerCase('vi').includes(query.q.toLocaleLowerCase('vi')));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestZone {
    const actor = this.activeUser(actorId);
    const zone = this.getRecord(id);
    if (!this.canReadFarm(actorId, zone.farm_id) && !(actor.role === 'Farmer' && this.assignments.hasActive(actorId, zone.id))) {
      throw new NotFoundException('Không tìm thấy Zone trong phạm vi truy cập');
    }
    return zone;
  }

  // Dành cho service phân công; không được expose thẳng qua controller.
  getRecord(id: string): TestZone {
    const zone = this.zones.get(id);
    if (!zone) { throw new NotFoundException('Không tìm thấy Zone'); }
    return structuredClone(zone);
  }

  create(actorId: string, input: CreateZoneDto): TestZone {
    const farm = this.writableFarm(actorId, input.farm_id, 'Farmer');
    return this.commitNew(farm, this.details(input));
  }

  update(actorId: string, id: string, changes: UpdateZoneDto): TestZone {
    const zone = this.getRecord(id);
    const farm = this.writableFarm(actorId, zone.farm_id, 'Farmer');
    this.requireChanges(zone, changes);
    return this.commitUpdate(farm, zone, changes);
  }

  createRequest(actorId: string, input: CreateZoneDto): ZoneChangeRequest {
    const farm = this.writableFarm(actorId, input.farm_id, 'Admin');
    const changes = this.details(input);
    this.validateZone(farm, changes);
    this.requireZoneCapacity();
    return this.addRequest(actorId, farm, null, changes);
  }

  updateRequest(actorId: string, id: string, changes: UpdateZoneDto): ZoneChangeRequest {
    const zone = this.getRecord(id);
    const farm = this.writableFarm(actorId, zone.farm_id, 'Admin');
    this.requireChanges(zone, changes);
    this.validateZone(farm, { ...zone, ...changes }, zone);
    if ([...this.requests.values()].some((request) => request.value.zone_id === id && request.value.status === 'Pending')) {
      throw new ConflictException('Zone đã có đề xuất Admin đang chờ');
    }
    return this.addRequest(actorId, farm, zone, changes);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((item) => item.value).filter((item) =>
      (actor.role === 'Admin' || item.owner_id === actor.id) && (!query.status || item.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): ZoneChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (actor.role !== 'Admin' && actor.id !== request.owner_id) { throw new NotFoundException('Không tìm thấy đề xuất Zone'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): ZoneChangeRequest {
    const stored = this.requireRequest(id);
    const request = stored.value;
    this.requireReviewer(actorId, request);
    const farm = this.writableFarm(actorId, request.farm_id, 'Farmer');
    const proposer = this.activeUser(request.proposed_by);
    if (proposer.role !== 'Admin') { throw new ConflictException('Người đề xuất không còn là Admin'); }
    if (request.zone_id && this.versions.get(request.zone_id) !== stored.version) {
      throw new ConflictException('Zone đã thay đổi; từ chối và lập đề xuất mới');
    }
    // Recheck standard và diện tích ở lúc duyệt; đề xuất Pending không giữ chỗ diện tích.
    const zone = request.zone_id
      ? this.commitUpdate(farm, this.getRecord(request.zone_id), request.proposed_changes)
      : this.commitNew(farm, request.proposed_changes as ZoneDetailsDto);
    stored.value = { ...request, zone_id: zone.id, status: 'Accepted', resolved_by: actorId, resolved_at: new Date().toISOString() };
    return structuredClone(stored.value);
  }

  reject(actorId: string, id: string, reason?: string): ZoneChangeRequest {
    const stored = this.requireRequest(id);
    this.requireReviewer(actorId, stored.value);
    stored.value = { ...stored.value, status: 'Rejected', rejection_reason: reason ?? null,
      resolved_by: actorId, resolved_at: new Date().toISOString() };
    return structuredClone(stored.value);
  }

  private commitNew(farm: TestFarm, input: ZoneDetailsDto): TestZone {
    this.requireZoneCapacity();
    this.validateZone(farm, input);
    const zone = { ...input, id: randomUUID(), farm_id: farm.id };
    this.save(zone);
    return structuredClone(zone);
  }

  private commitUpdate(farm: TestFarm, zone: TestZone, changes: UpdateZoneDto): TestZone {
    const next = { ...zone, ...changes };
    this.validateZone(farm, next, zone);
    this.save(next);
    return structuredClone(next);
  }

  private save(zone: TestZone): void {
    // Không await giữa validate và commit: bất biến được giữ trong demo một process.
    this.areaBudget.recordZone(zone.farm_id, zone.id, zone.area_size);
    this.zones.set(zone.id, zone);
    this.versions.set(zone.id, (this.versions.get(zone.id) ?? 0) + 1);
  }

  private validateZone(farm: TestFarm, next: ZoneDetailsDto, previous?: TestZone): void {
    const standard = this.standards.get(next.standard_id);
    if ((!previous || previous.standard_id !== next.standard_id) && standard.status !== 'Active') {
      throw new ConflictException('Tiêu chuẩn mới gắn Zone phải Active');
    }
    this.areaBudget.assertCapacity(farm.id, farm.area_size, previous?.id, next.area_size);
  }

  private writableFarm(actorId: string, farmId: string, role: 'Admin' | 'Farmer'): TestFarm {
    const actor = this.activeUser(actorId);
    if (actor.role !== role) { throw new ForbiddenException(role === 'Admin' ? 'Admin phải gửi đề xuất Zone' : 'Chỉ chủ Farmer được ghi trực tiếp Zone'); }
    const farm = this.farms.getRecord(farmId);
    if (actor.role === 'Farmer' && actor.id !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm được thay đổi Zone'); }
    const owner = this.activeUser(farm.owner_id);
    if (owner.role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
    return farm;
  }

  private canReadFarm(actorId: string, farmId: string): boolean {
    try { this.farms.get(actorId, farmId); return true; }
    catch (error) { if (error instanceof NotFoundException) { return false; } throw error; }
  }

  private activeUser(id: string): TestUser {
    const user = this.users.findById(id);
    if (user?.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return user;
  }

  private requireChanges(zone: TestZone, changes: UpdateZoneDto): void {
    if (!Object.keys(changes).length || !Object.entries(changes).some(([key, value]) => zone[key as keyof TestZone] !== value)) {
      throw new BadRequestException('Cần ít nhất một thay đổi khác dữ liệu Zone hiện tại');
    }
  }

  private details(input: ZoneDetailsDto): ZoneDetailsDto {
    return { standard_id: input.standard_id, zone_name: input.zone_name, area_size: input.area_size, longitude: input.longitude, latitude: input.latitude };
  }

  private addRequest(actorId: string, farm: TestFarm, zone: TestZone | null, changes: Partial<ZoneDetailsDto>): ZoneChangeRequest {
    if (this.requests.size >= 2000) { throw new HttpException('Bộ nhớ đề xuất Zone đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const value: ZoneChangeRequest = { id: randomUUID(), action: zone ? 'Update' : 'Create', status: 'Pending', farm_id: farm.id,
      zone_id: zone?.id ?? null, owner_id: farm.owner_id, proposed_by: actorId, proposed_changes: structuredClone(changes),
      zone_snapshot: zone, created_at: new Date().toISOString(), resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, { value, version: zone ? this.versions.get(zone.id)! : null });
    return structuredClone(value);
  }

  private requireRequest(id: string) {
    const request = this.requests.get(id);
    if (!request) { throw new NotFoundException('Không tìm thấy đề xuất Zone'); }
    return request;
  }

  private requireReviewer(actorId: string, request: ZoneChangeRequest): void {
    const actor = this.activeUser(actorId);
    if (request.status !== 'Pending') { throw new ConflictException('Đề xuất Zone đã được xử lý'); }
    if (actor.role !== 'Farmer' || actor.id !== request.owner_id) { throw new ForbiddenException('Chỉ chủ Farmer được duyệt/từ chối đề xuất Zone'); }
  }

  private requireZoneCapacity(): void {
    if (this.zones.size >= 1000) { throw new HttpException('Bộ nhớ Zone đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private page<T>(items: T[], query: { limit: number; offset: number }) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
}
