import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { MockCooperativeStore } from '../users/mock-cooperative.store';
import { FarmsService } from '../farms/farms.service';
import { FarmPageDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { TreesService } from '../trees/trees.service';
import { MockZoneAssignmentStore } from '../assignments/mock-zone-assignment.store';
import { CreateHarvestBackdateDto, CreateHarvestDto, HarvestCorrectionDto, HarvestListDto, HarvestRequestListDto, UpdateHarvestDto } from './tree-harvests.dto';
import { HarvestBackdatePermission, HarvestDetails, HarvestRequest, TestTreeHarvest } from './tree-harvests.types';
import { HARVEST_BACKDATE_DAYS, validateHarvestDate } from './harvest-date-policy';

export const HARVEST_LIMIT = 5000;
export const HARVEST_REQUEST_LIMIT = 2000;
export const HARVEST_PERMISSION_LIMIT = 1000;
const DETAIL_FIELDS = ['season_name', 'harvest_date', 'fruit_count', 'total_weight_kg', 'batch_code'];

@Injectable()
export class TreeHarvestsService {
  private readonly records = new Map<string, TestTreeHarvest>();
  private readonly metadata = new Map<string, { version: number; everConfirmed: boolean }>();
  private readonly requests = new Map<string, { value: HarvestRequest; version: number }>();
  private readonly permissions = new Map<string, HarvestBackdatePermission>();

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(MockCooperativeStore) private readonly cooperatives: MockCooperativeStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(TreesService) private readonly trees: TreesService,
    @Inject(MockZoneAssignmentStore) private readonly assignments: MockZoneAssignmentStore,
  ) {}

  list(actorId: string, query: HarvestListDto) {
    const actor = this.activeUser(actorId);
    const q = query.q?.toLocaleLowerCase('vi');
    const items = [...this.records.values()].filter((record) => {
      if ((query.tree_id && query.tree_id !== record.tree_id) || (query.status && query.status !== record.status)) { return false; }
      const { zone } = this.context(record.tree_id);
      return (!query.zone_id || query.zone_id === zone.id) && this.canRead(actor, record)
        && (!q || [record.batch_code, record.season_name].some((text) => text.toLocaleLowerCase('vi').includes(q)));
    });
    return this.page(items, query);
  }

  get(actorId: string, id: string): TestTreeHarvest {
    const actor = this.activeUser(actorId);
    const record = this.record(id);
    if (!this.canRead(actor, record)) { throw new NotFoundException('Không tìm thấy thu hoạch trong phạm vi truy cập'); }
    return record;
  }

  create(actorId: string, input: CreateHarvestDto): TestTreeHarvest {
    this.allowedFields(input, [...DETAIL_FIELDS, 'tree_id']);
    const { farm, zone } = this.context(input.tree_id);
    this.assertWriter(actorId, farm.owner_id, zone.id);
    const details = this.details(input);
    this.validateDetails(actorId, input.tree_id, details, undefined, true, true);
    this.capacity(this.records.size, HARVEST_LIMIT, 'thu hoạch');
    const id = randomUUID();
    if (this.records.has(id)) { throw new ConflictException('Không thể tạo id thu hoạch duy nhất; thử lại'); }
    const value: TestTreeHarvest = { ...details, id, tree_id: input.tree_id, created_by: actorId, created_at: this.now(),
      status: 'Draft', updated_by: null, updated_at: null };
    this.records.set(id, value);
    this.metadata.set(id, { version: 1, everConfirmed: false });
    return structuredClone(value);
  }

  updateDraft(actorId: string, id: string, input: UpdateHarvestDto): TestTreeHarvest {
    const record = this.record(id);
    this.assertDraftEditor(actorId, record);
    if (record.status !== 'Draft') { throw new ConflictException('Chỉ sửa trực tiếp bản nháp Draft'); }
    const changes = this.changes(record, input);
    this.validateDetails(actorId, record.tree_id, { ...record, ...changes }, id, changes.harvest_date !== undefined, true);
    // Hai field update chỉ phản ánh thay đổi được duyệt, không ghi khi sửa nháp.
    return this.save({ ...record, ...changes });
  }

  removeDraft(actorId: string, id: string) {
    const record = this.record(id);
    this.assertDraftEditor(actorId, record);
    if (record.status !== 'Draft' || this.metadata.get(id)!.everConfirmed) { throw new ConflictException('Không xóa Pending hoặc bản ghi đã từng Confirmed'); }
    this.records.delete(id);
    this.metadata.delete(id);
    return { deleted: true, id };
  }

  submit(actorId: string, id: string): TestTreeHarvest {
    const record = this.record(id);
    const { farm, zone } = this.context(record.tree_id);
    this.assertWriter(actorId, farm.owner_id, zone.id);
    if (record.created_by !== actorId) { throw new ForbiddenException('Chỉ người tạo gửi bản nháp lên xác nhận'); }
    if (record.status !== 'Draft') { throw new ConflictException('Chỉ gửi bản nháp Draft'); }
    this.validateDetails(actorId, record.tree_id, record, id, false, false);
    if (actorId === farm.owner_id) {
      return this.save({ ...record, status: 'Confirmed' }, true);
    }
    this.addRequest(record, 'Confirm', actorId, null, null, null);
    return this.record(id);
  }

  correction(actorId: string, id: string, input: HarvestCorrectionDto): HarvestRequest {
    this.allowedFields(input, ['reason', 'changes']);
    const actor = this.activeUser(actorId);
    const record = this.get(actorId, id);
    const { farm, zone } = this.context(record.tree_id);
    if (actor.role !== 'Farmer' || (actorId !== record.created_by && actorId !== farm.owner_id)) { throw new ForbiddenException('Chỉ tác giả hoặc chủ Farm yêu cầu sửa'); }
    if (record.status !== 'Confirmed') { throw new ConflictException('Chỉ yêu cầu sửa bản ghi Confirmed'); }
    this.activeOwner(farm.owner_id);
    const canEdit = actorId === farm.owner_id || this.assignments.hasActive(actorId, zone.id);
    if (!canEdit && input.changes !== undefined) { throw new ForbiddenException('Tác giả hết phân công chỉ gửi lý do; chủ Farm chuẩn bị nội dung sửa'); }
    let changes: Partial<HarvestDetails> | null = null;
    if (input.changes !== undefined) {
      changes = this.changes(record, input.changes);
      this.validateDetails(actorId, record.tree_id, { ...record, ...changes }, id, changes.harvest_date !== undefined, false);
    }
    return this.addRequest(record, 'Correct', actorId, changes ? actorId : null, changes, input.reason);
  }

  prepareCorrection(actorId: string, requestId: string, input: UpdateHarvestDto): HarvestRequest {
    const entry = this.pendingRequest(requestId);
    const request = entry.value;
    if (request.action !== 'Correct') { throw new ConflictException('Không bổ sung nội dung cho yêu cầu xác nhận lần đầu'); }
    const record = this.record(request.harvest_id);
    const { farm, zone } = this.context(record.tree_id);
    this.assertRequestContext(entry, farm.owner_id, farm.cooperative_id);
    this.assertWriter(actorId, farm.owner_id, zone.id);
    if (actorId !== farm.owner_id && actorId !== request.requested_by) { throw new ForbiddenException('Chỉ người yêu cầu hoặc chủ Farm chuẩn bị nội dung sửa'); }
    const changes = this.changes(record, input);
    this.validateDetails(actorId, record.tree_id, { ...record, ...changes }, record.id, changes.harvest_date !== undefined, false);
    entry.value = { ...request, editor_id: actorId, proposed_changes: changes };
    return structuredClone(entry.value);
  }

  approve(actorId: string, requestId: string): HarvestRequest {
    const entry = this.pendingRequest(requestId);
    const request = entry.value;
    const record = this.record(request.harvest_id);
    const { farm, zone } = this.context(record.tree_id);
    this.assertReviewer(actorId, request);
    this.assertRequestContext(entry, farm.owner_id, farm.cooperative_id);
    this.activeUser(request.requested_by);
    this.activeOwner(farm.owner_id);
    let next: TestTreeHarvest;
    if (request.action === 'Confirm') {
      this.assertWriter(record.created_by, farm.owner_id, zone.id);
      next = { ...record, status: 'Confirmed' };
    } else {
      if (!request.editor_id || !request.proposed_changes) { throw new ConflictException('Chủ/người yêu cầu cần bổ sung nội dung sửa trước khi duyệt'); }
      this.assertWriter(request.editor_id, farm.owner_id, zone.id);
      const details = { ...record, ...request.proposed_changes };
      this.validateDetails(request.editor_id, record.tree_id, details, record.id, request.proposed_changes.harvest_date !== undefined, false);
      next = { ...details, status: 'Confirmed', updated_by: request.editor_id, updated_at: this.now() };
    }
    // Đồng bộ, không await: uniqueness, quyền và commit không bị chen bởi một request khác.
    this.save(next, true);
    entry.value = { ...request, status: 'Accepted', resolved_by: actorId, resolved_at: this.now() };
    return structuredClone(entry.value);
  }

  reject(actorId: string, requestId: string, reason?: string): HarvestRequest {
    const entry = this.pendingRequest(requestId);
    const request = entry.value;
    const actor = this.activeUser(actorId);
    const record = this.record(request.harvest_id);
    const { farm } = this.context(record.tree_id);
    // Chủ/người yêu cầu có thể rút đề xuất lỗi thời; không bắt buộc bên duyệt còn thuộc HTX cũ.
    if (actor.id !== request.requested_by && actor.id !== farm.owner_id) { this.assertReviewer(actorId, request); }
    this.save({ ...record, status: request.action === 'Confirm' ? 'Draft' : 'Confirmed' });
    entry.value = { ...request, status: 'Rejected', resolved_at: this.now(), resolved_by: actorId, rejection_reason: reason ?? null };
    return structuredClone(entry.value);
  }

  listRequests(actorId: string, query: HarvestRequestListDto) {
    const actor = this.activeUser(actorId);
    return this.page([...this.requests.values()].map((entry) => entry.value).filter((request) =>
      (!query.status || request.status === query.status) && (!query.harvest_id || request.harvest_id === query.harvest_id)
      && this.canReadRequest(actor, request)), query);
  }

  getRequest(actorId: string, id: string): HarvestRequest {
    const actor = this.activeUser(actorId);
    const entry = this.requests.get(id);
    if (!entry || !this.canReadRequest(actor, entry.value)) { throw new NotFoundException('Không tìm thấy yêu cầu thu hoạch'); }
    return structuredClone(entry.value);
  }

  grantBackdate(actorId: string, input: CreateHarvestBackdateDto): HarvestBackdatePermission {
    this.admin(actorId);
    this.allowedFields(input, ['user_id', 'zone_id', 'harvest_date', 'expires_at', 'reason']);
    const zone = this.zones.getRecord(input.zone_id);
    const farm = this.farms.getRecord(zone.farm_id);
    this.assertWriter(input.user_id, farm.owner_id, zone.id);
    validateHarvestDate(input.harvest_date);
    const expires = Date.parse(input.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) { throw new BadRequestException('expires_at phải ở tương lai'); }
    this.capacity(this.permissions.size, HARVEST_PERMISSION_LIMIT, 'quyền nhập bù');
    const value: HarvestBackdatePermission = { ...input, id: randomUUID(), granted_by: actorId, created_at: this.now(),
      expires_at: new Date(expires).toISOString(), revoked_at: null };
    this.permissions.set(value.id, value);
    return structuredClone(value);
  }

  listBackdates(actorId: string, query: FarmPageDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.permissions.values()].filter((permission) => actor.role === 'Admin' || actorId === permission.user_id
      || actorId === this.farms.getRecord(this.zones.getRecord(permission.zone_id).farm_id).owner_id);
    return this.page(items, query);
  }

  revokeBackdate(actorId: string, id: string): HarvestBackdatePermission {
    this.admin(actorId);
    const permission = this.permissions.get(id);
    if (!permission) { throw new NotFoundException('Không tìm thấy quyền nhập bù'); }
    if (permission.revoked_at) { throw new ConflictException('Quyền đã bị thu hồi'); }
    const value = { ...permission, revoked_at: this.now() };
    this.permissions.set(id, value);
    return structuredClone(value);
  }

  private context(treeId: string) {
    const tree = this.trees.getRecord(treeId);
    const zone = this.zones.getRecord(tree.zone_id);
    return { tree, zone, farm: this.farms.getRecord(zone.farm_id) };
  }

  private record(id: string): TestTreeHarvest {
    const record = this.records.get(id);
    if (!record) { throw new NotFoundException('Không tìm thấy bản ghi thu hoạch'); }
    return structuredClone(record);
  }

  private save(record: TestTreeHarvest, confirmed = false): TestTreeHarvest {
    const meta = this.metadata.get(record.id)!;
    this.records.set(record.id, structuredClone(record));
    this.metadata.set(record.id, { version: meta.version + 1, everConfirmed: meta.everConfirmed || confirmed });
    return structuredClone(record);
  }

  private addRequest(record: TestTreeHarvest, action: HarvestRequest['action'], actorId: string, editorId: string | null,
    changes: Partial<HarvestDetails> | null, reason: string | null): HarvestRequest {
    this.capacity(this.requests.size, HARVEST_REQUEST_LIMIT, 'yêu cầu thu hoạch');
    if ([...this.requests.values()].some((entry) => entry.value.harvest_id === record.id && entry.value.status === 'Pending')) {
      throw new ConflictException('Bản ghi đã có yêu cầu Pending');
    }
    const { farm } = this.context(record.tree_id);
    const value: HarvestRequest = { id: randomUUID(), harvest_id: record.id, action, status: 'Pending', requested_by: actorId,
      editor_id: editorId, owner_id: farm.owner_id, cooperative_id: farm.cooperative_id, reason, proposed_changes: changes,
      harvest_snapshot: structuredClone(record), created_at: this.now(), resolved_at: null, resolved_by: null, rejection_reason: null };
    this.save({ ...record, status: 'Pending' });
    this.requests.set(value.id, { value, version: this.metadata.get(record.id)!.version });
    return structuredClone(value);
  }

  private pendingRequest(id: string) {
    const entry = this.requests.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy yêu cầu thu hoạch'); }
    if (entry.value.status !== 'Pending') { throw new ConflictException('Yêu cầu đã được xử lý'); }
    return entry;
  }

  private assertRequestContext(entry: { value: HarvestRequest; version: number }, ownerId: string, cooperativeId: string | null) {
    if (entry.value.owner_id !== ownerId || (entry.value.action === 'Correct' && entry.value.cooperative_id !== cooperativeId)) {
      throw new ConflictException('Chủ/HTX đã thay đổi; rút yêu cầu và gửi lại');
    }
    if (this.metadata.get(entry.value.harvest_id)!.version !== entry.version || this.record(entry.value.harvest_id).status !== 'Pending') {
      throw new ConflictException('Bản ghi đã thay đổi; cần yêu cầu mới');
    }
  }

  private assertReviewer(actorId: string, request: HarvestRequest) {
    const actor = this.activeUser(actorId);
    const { farm } = this.context(request.harvest_snapshot.tree_id);
    if (request.action === 'Confirm') {
      if (actor.role !== 'Farmer' || actorId !== farm.owner_id) { throw new ForbiddenException('Chỉ chủ Farm xác nhận lần đầu'); }
    } else if (farm.cooperative_id) {
      if (actor.role !== 'Manager' || this.cooperatives.get(farm.cooperative_id).manager_id !== actorId) { throw new ForbiddenException('Chỉ Manager HTX hiện tại duyệt sửa'); }
    } else if (actor.role !== 'Admin') { throw new ForbiddenException('Farm độc lập cần Admin duyệt sửa'); }
  }

  private assertDraftEditor(actorId: string, record: TestTreeHarvest) {
    const { farm, zone } = this.context(record.tree_id);
    this.assertWriter(actorId, farm.owner_id, zone.id);
    if (actorId !== farm.owner_id && actorId !== record.created_by) { throw new ForbiddenException('Chỉ tác giả hoặc chủ Farm sửa/xóa nháp'); }
  }

  private assertWriter(actorId: string, ownerId: string, zoneId: string) {
    const actor = this.activeUser(actorId);
    this.activeOwner(ownerId);
    if (actor.role !== 'Farmer' || (actorId !== ownerId && !this.assignments.hasActive(actorId, zoneId))) {
      throw new ForbiddenException('Chỉ chủ Farm hoặc Farmer đang phụ trách Zone được ghi thu hoạch');
    }
  }

  private canRead(actor: TestUser, record: TestTreeHarvest): boolean {
    // Tác giả giữ quyền đọc bản ghi của mình khi hết phân công để gửi yêu cầu sửa.
    if (actor.role === 'Farmer' && actor.id === record.created_by) { return true; }
    try { this.zones.get(actor.id, this.context(record.tree_id).zone.id); return true; }
    catch (error) { if (error instanceof NotFoundException) { return false; } throw error; }
  }

  private canReadRequest(actor: TestUser, request: HarvestRequest): boolean {
    const { farm } = this.context(request.harvest_snapshot.tree_id);
    return actor.role === 'Admin' || actor.id === request.requested_by || actor.id === request.editor_id || actor.id === farm.owner_id
      || (actor.role === 'Farmer' && actor.id === request.harvest_snapshot.created_by)
      || (actor.role === 'Manager' && farm.cooperative_id !== null && this.cooperatives.get(farm.cooperative_id).manager_id === actor.id);
  }

  private validateDetails(actorId: string, treeId: string, details: HarvestDetails, excludingId: string | undefined, checkBackdate: boolean, checkTree: boolean) {
    const days = validateHarvestDate(details.harvest_date);
    const { tree, zone } = this.context(treeId);
    if (checkTree && tree.status !== 'Active' && days === 0) { throw new BadRequestException('Cây Dead/Removed chỉ được nhập bù ngày cũ'); }
    if (checkBackdate && days > HARVEST_BACKDATE_DAYS && !this.hasBackdate(actorId, zone.id, details.harvest_date)) {
      throw new ForbiddenException('Nhập bù quá 7 ngày cần quyền Admin đúng người/Zone/ngày còn hạn');
    }
    for (const other of this.records.values()) {
      if (other.id === excludingId) { continue; }
      if (other.tree_id === treeId && other.harvest_date === details.harvest_date) { throw new ConflictException('Cây đã có thu hoạch trong ngày này; sửa cộng dồn bản nháp'); }
      if (other.batch_code === details.batch_code && (other.harvest_date !== details.harvest_date || this.context(other.tree_id).zone.id !== zone.id)) {
        throw new ConflictException('Mã batch chỉ dùng trong một Zone và một ngày thu hoạch');
      }
    }
  }

  private hasBackdate(userId: string, zoneId: string, date: string): boolean {
    return [...this.permissions.values()].some((permission) => permission.user_id === userId && permission.zone_id === zoneId
      && permission.harvest_date === date && permission.revoked_at === null && Date.parse(permission.expires_at) > Date.now()
      && this.users.findById(permission.granted_by)?.status === 'Active' && this.users.findById(permission.granted_by)?.role === 'Admin');
  }

  private details(input: HarvestDetails): HarvestDetails {
    return { season_name: input.season_name, harvest_date: input.harvest_date, fruit_count: input.fruit_count,
      total_weight_kg: input.total_weight_kg, batch_code: input.batch_code };
  }

  private changes(record: TestTreeHarvest, input: UpdateHarvestDto): Partial<HarvestDetails> {
    this.allowedFields(input, DETAIL_FIELDS);
    const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== undefined && value !== record[key as keyof HarvestDetails])) as Partial<HarvestDetails>;
    if (!Object.keys(changes).length) { throw new BadRequestException('Cần ít nhất một thay đổi thực sự'); }
    return changes;
  }

  private allowedFields(input: object, fields: string[]) {
    if (!input || Object.keys(input).some((key) => !fields.includes(key))) { throw new BadRequestException('Không nhận field ngoài contract hoặc sửa field backend quản lý'); }
  }

  private activeUser(id: string): TestUser {
    const user = this.users.findById(id);
    if (!user || user.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return user;
  }

  private activeOwner(id: string) {
    if (this.activeUser(id).role !== 'Farmer') { throw new ConflictException('Chủ Farm phải là Farmer Active'); }
  }

  private admin(id: string) {
    if (this.activeUser(id).role !== 'Admin') { throw new ForbiddenException('Chỉ Admin cấp/thu hồi quyền nhập bù'); }
  }

  private capacity(size: number, limit: number, name: string) {
    if (size >= limit) { throw new HttpException(`Bộ nhớ ${name} đã đầy`, HttpStatus.TOO_MANY_REQUESTS); }
  }

  private now(): string { return new Date(Date.now()).toISOString(); }
  private page<T>(items: T[], query: FarmPageDto) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
}
