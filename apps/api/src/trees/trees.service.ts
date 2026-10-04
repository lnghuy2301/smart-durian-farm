import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmPageDto, FarmRequestListDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { CreateTreeDto, TreeListDto, UpdateTreeDto } from './trees.dto';
import { TestTree, TreeChangeRequest, TreeDetails, TreeMetadataHistory } from './trees.types';

export const TREE_LIMIT = 5000;
export const TREE_REQUEST_LIMIT = 2000;
export const TREE_HISTORY_LIMIT = 10000;

@Injectable()
export class TreesService {
  private readonly trees = new Map<string, TestTree>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, { value: TreeChangeRequest; version: number | null }>();
  private readonly changes: TreeMetadataHistory[] = [];

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
  ) {}

  list(actorId: string, query: TreeListDto) {
    this.activeUser(actorId);
    const visibleZones = new Map<string, boolean>();
    const q = query.q?.toLocaleLowerCase('vi');
    const items = [...this.trees.values()].filter((tree) => {
      if ((query.zone_id && tree.zone_id !== query.zone_id) || (query.status && tree.status !== query.status)) { return false; }
      if (!visibleZones.has(tree.zone_id)) { visibleZones.set(tree.zone_id, this.canReadZone(actorId, tree.zone_id)); }
      return visibleZones.get(tree.zone_id) && (!q || [tree.tree_code, tree.variety].some((text) => text.toLocaleLowerCase('vi').includes(q)));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestTree {
    this.activeUser(actorId);
    const tree = this.getRecord(id);
    this.zones.get(actorId, tree.zone_id);
    return tree;
  }

  getByCode(actorId: string, code: string): TestTree {
    this.activeUser(actorId);
    const tree = [...this.trees.values()].find((item) => item.tree_code === code);
    if (!tree) { throw new NotFoundException('Không tìm thấy cây'); }
    return this.get(actorId, tree.id);
  }

  // Chỉ cho service nội bộ: controller phải dùng get/getByCode với kiểm tra quyền.
  getRecord(id: string): TestTree {
    const tree = this.trees.get(id);
    if (!tree) { throw new NotFoundException('Không tìm thấy cây'); }
    return structuredClone(tree);
  }

  history(actorId: string, id: string, query: FarmPageDto) {
    this.get(actorId, id);
    return this.page(this.changes.filter((change) => change.tree_id === id), query);
  }

  create(actorId: string, input: CreateTreeDto): TestTree {
    this.managementContext(actorId, input.zone_id, 'Farmer');
    return this.commit(actorId, input.zone_id, this.createDetails(input), null);
  }

  update(actorId: string, id: string, input: UpdateTreeDto): TestTree {
    const tree = this.getRecord(id);
    this.managementContext(actorId, tree.zone_id, 'Farmer');
    const changes = this.updateDetails(tree, input);
    return this.commit(actorId, tree.zone_id, { ...tree, ...changes }, tree);
  }

  createRequest(actorId: string, input: CreateTreeDto): TreeChangeRequest {
    const { farm } = this.managementContext(actorId, input.zone_id, 'Admin');
    const changes = this.createDetails(input);
    this.requireCapacity(true);
    return this.addRequest(actorId, input.zone_id, farm.id, farm.owner_id, null, changes);
  }

  updateRequest(actorId: string, id: string, input: UpdateTreeDto): TreeChangeRequest {
    const tree = this.getRecord(id);
    const { farm } = this.managementContext(actorId, tree.zone_id, 'Admin');
    const changes = this.updateDetails(tree, input);
    if ([...this.requests.values()].some((entry) => entry.value.tree_id === id && entry.value.status === 'Pending')) {
      throw new ConflictException('Cây đã có đề xuất sửa Pending');
    }
    return this.addRequest(actorId, tree.zone_id, farm.id, farm.owner_id, tree, changes);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((entry) => entry.value).filter((request) =>
      (actor.role === 'Admin' || request.owner_id === actorId) && (!query.status || request.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): TreeChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (actor.role !== 'Admin' && actorId !== request.owner_id) { throw new NotFoundException('Không tìm thấy đề xuất cây'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): TreeChangeRequest {
    const entry = this.requireRequest(id);
    const request = entry.value;
    this.requireReviewer(actorId, request);
    const { farm } = this.managementContext(actorId, request.zone_id, 'Farmer');
    if (farm.id !== request.farm_id || farm.owner_id !== request.owner_id) { throw new ConflictException('Farm/chủ đã thay đổi; cần đề xuất mới'); }
    if (this.activeUser(request.proposed_by).role !== 'Admin') { throw new ConflictException('Người đề xuất không còn là Admin'); }
    const before = request.tree_id ? this.getRecord(request.tree_id) : null;
    if (before && this.versions.get(before.id) !== entry.version) { throw new ConflictException('Cây đã thay đổi; từ chối và lập đề xuất mới'); }
    const details = before ? { ...before, ...request.proposed_changes } : request.proposed_changes as TreeDetails;
    // Dung lượng và lịch sử được kiểm tra trước commit; Accepted chỉ ghi sau khi cây + audit đã thành công.
    const tree = this.commit(actorId, request.zone_id, details, before, request);
    entry.value = { ...request, tree_id: tree.id, status: 'Accepted', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString() };
    return structuredClone(entry.value);
  }

  reject(actorId: string, id: string, reason?: string): TreeChangeRequest {
    const entry = this.requireRequest(id);
    this.requireReviewer(actorId, entry.value);
    entry.value = { ...entry.value, status: 'Rejected', resolved_by: actorId,
      resolved_at: new Date(Date.now()).toISOString(), rejection_reason: reason ?? null };
    return structuredClone(entry.value);
  }

  private managementContext(actorId: string, zoneId: string, role: 'Admin' | 'Farmer') {
    const actor = this.activeUser(actorId);
    if (actor.role !== role) { throw new ForbiddenException(role === 'Admin' ? 'Chỉ Admin gửi đề xuất cây' : 'Chỉ chủ Farmer được ghi trực tiếp cây'); }
    const zone = this.zones.getRecord(zoneId);
    const farm = this.farms.getRecord(zone.farm_id);
    if (role === 'Farmer' && actor.id !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm được thay đổi cây'); }
    if (this.activeUser(farm.owner_id).role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
    return { zone, farm };
  }

  private commit(actorId: string, zoneId: string, details: TreeDetails, before: TestTree | null, request?: TreeChangeRequest): TestTree {
    this.requireCapacity(before === null);
    const id = before?.id ?? this.newTreeId();
    const tree: TestTree = { id, zone_id: zoneId, tree_code: before?.tree_code ?? `DRN-${id}`,
      variety: details.variety, plant_date: details.plant_date, longitude: details.longitude, latitude: details.latitude, status: details.status };
    const version = (this.versions.get(id) ?? 0) + 1;
    const history: TreeMetadataHistory = { id: randomUUID(), tree_id: id, action: before ? 'Update' : 'Create', actor_id: actorId,
      proposed_by: request?.proposed_by ?? null, request_id: request?.id ?? null, version,
      changed_at: new Date(Date.now()).toISOString(), before: before ? structuredClone(before) : null, after: structuredClone(tree) };
    // Không await giữa kiểm tra/ghi: sửa trạng thái luôn giữ cùng mã/Zone và thêm snapshot lịch sử.
    this.trees.set(id, tree);
    this.versions.set(id, version);
    this.changes.push(history);
    return structuredClone(tree);
  }

  private newTreeId(): string {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = randomUUID();
      if (!this.trees.has(id)) { return id; }
    }
    throw new ConflictException('Không thể sinh mã cây duy nhất; thử lại');
  }

  private createDetails(input: CreateTreeDto): TreeDetails {
    this.allowedFields(input, ['zone_id', 'variety', 'plant_date', 'longitude', 'latitude', 'status']);
    return { variety: input.variety, plant_date: this.date(input.plant_date), longitude: input.longitude,
      latitude: input.latitude, status: input.status ?? 'Active' };
  }

  private updateDetails(tree: TestTree, input: UpdateTreeDto): Partial<TreeDetails> {
    this.allowedFields(input, ['variety', 'plant_date', 'longitude', 'latitude', 'status']);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<TreeDetails>;
    if (changes.plant_date !== undefined) { changes.plant_date = this.date(changes.plant_date); }
    if (!Object.entries(changes).some(([key, value]) => tree[key as keyof TreeDetails] !== value)) {
      throw new BadRequestException('Cần ít nhất một thông tin cây thực sự thay đổi');
    }
    return changes;
  }

  private allowedFields(input: object, fields: string[]): void {
    if (Object.keys(input).some((key) => !fields.includes(key))) { throw new BadRequestException('Không sửa id, tree_code, zone_id hoặc field ngoài contract'); }
  }

  private date(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) { throw new BadRequestException('plant_date không hợp lệ'); }
    return new Date(parsed).toISOString();
  }

  private addRequest(actorId: string, zoneId: string, farmId: string, ownerId: string, tree: TestTree | null, changes: Partial<TreeDetails>) {
    if (this.requests.size >= TREE_REQUEST_LIMIT) { throw new HttpException('Bộ nhớ đề xuất cây đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const value: TreeChangeRequest = { id: randomUUID(), action: tree ? 'Update' : 'Create', status: 'Pending', tree_id: tree?.id ?? null,
      zone_id: zoneId, farm_id: farmId, owner_id: ownerId, proposed_by: actorId, proposed_changes: structuredClone(changes),
      tree_snapshot: tree ? structuredClone(tree) : null, created_at: new Date(Date.now()).toISOString(),
      resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, { value, version: tree ? this.versions.get(tree.id)! : null });
    return structuredClone(value);
  }

  private requireCapacity(creating: boolean): void {
    if (creating && this.trees.size >= TREE_LIMIT) { throw new HttpException('Bộ nhớ cây đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    if (this.changes.length >= TREE_HISTORY_LIMIT) { throw new HttpException('Bộ nhớ lịch sử cây đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private requireRequest(id: string) {
    const entry = this.requests.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy đề xuất cây'); }
    return entry;
  }

  private requireReviewer(actorId: string, request: TreeChangeRequest): void {
    const actor = this.activeUser(actorId);
    if (request.status !== 'Pending') { throw new ConflictException('Đề xuất cây đã được xử lý'); }
    if (actor.role !== 'Farmer' || actorId !== request.owner_id) { throw new ForbiddenException('Chỉ chủ Farmer được duyệt/từ chối đề xuất cây'); }
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
