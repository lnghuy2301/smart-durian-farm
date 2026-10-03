import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { FarmsService } from '../farms/farms.service';
import { FarmRequestListDto } from '../farms/farms.dto';
import { ZonesService } from '../zones/zones.service';
import { TestZone } from '../zones/zones.types';
import { AssignmentListDto, CreateAssignmentRequestDto } from './assignments.dto';
import { AssignmentHistory, AssignmentRequest } from './assignments.types';
import { MockZoneAssignmentStore } from './mock-zone-assignment.store';
import { assignmentActive, assignmentAllowsCorrection, CORRECTION_GRACE_DAYS, intervalsOverlap } from './assignment-policy';

@Injectable()
export class AssignmentsService {
  private readonly requests = new Map<string, AssignmentRequest>();

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(MockZoneAssignmentStore) private readonly store: MockZoneAssignmentStore,
  ) {}

  createRequest(actorId: string, zoneId: string, input: CreateAssignmentRequestDto): AssignmentRequest {
    const { actor, zone, ownerId } = this.managementContext(actorId, zoneId);
    this.activeFarmer(input.user_id);
    const now = new Date().toISOString();
    const start = input.start_date ? this.date(input.start_date) : now;
    const end = input.end_date ? this.date(input.end_date) : null;
    const actualEarliestStart = new Date(Math.max(Date.parse(start), Date.parse(now))).toISOString();
    if (end && Date.parse(end) <= Date.parse(actualEarliestStart)) { throw new BadRequestException('end_date phải sau start_date và sau thời điểm hiện tại'); }
    this.assertAvailable(zoneId, actualEarliestStart, end);
    return this.addRequest(actor, zone, ownerId, 'Assign', input.user_id, start, end, null);
  }

  list(actorId: string, query: AssignmentListDto, mineOnly = false) {
    const actor = this.activeUser(actorId);
    const now = Date.now();
    const items = this.store.list().filter((entry) => (!query.zone_id || entry.assignment.zone_id === query.zone_id)
      && (mineOnly ? entry.assignment.user_id === actor.id : this.canReadEntry(actor, entry)))
      .map((entry) => this.historyResponse(entry, now));
    return this.page(items, query);
  }

  get(actorId: string, id: string) {
    const actor = this.activeUser(actorId);
    const entry = this.store.get(id);
    if (!this.canReadEntry(actor, entry)) { throw new NotFoundException('Không tìm thấy phân công trong phạm vi truy cập'); }
    return this.historyResponse(entry, Date.now());
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].filter((request) => this.canReadRequest(actor, request)
      && (!query.status || request.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): AssignmentRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id);
    if (!this.canReadRequest(actor, request)) { throw new NotFoundException('Không tìm thấy lời mời phân công'); }
    return structuredClone(request);
  }

  approve(actorId: string, id: string): AssignmentRequest {
    const actor = this.activeFarmer(actorId);
    const current = this.requireRequest(id);
    this.pending(current);
    const matching = current.required_approvals.filter((approval) => approval.user_id === actor.id && !approval.approved_at);
    if (!matching.length) { throw new ForbiddenException('Bạn không phải bên còn cần chấp nhận phân công'); }
    const zone = this.validateContext(current);
    const next = structuredClone(current);
    const now = new Date().toISOString();
    // Nếu chủ cũng nhận công việc, một lần chấp nhận đáp ứng cả hai mục đích.
    for (const approval of next.required_approvals) { if (approval.user_id === actor.id) { approval.approved_at ??= now; } }
    if (next.required_approvals.every((approval) => approval.approved_at)) {
      for (const approval of next.required_approvals) { this.activeFarmer(approval.user_id); }
      if (next.action === 'Assign') {
        // Không cấp quyền lùi về trước lúc nhận việc. Giữ mốc dự kiến trên request để audit.
        const start = new Date(Math.max(Date.parse(next.start_date), Date.parse(now))).toISOString();
        if (next.end_date && Date.parse(next.end_date) <= Date.parse(start)) { throw new ConflictException('Lời mời đã hết khoảng thời gian; cần lập lại'); }
        this.assertAvailable(zone.id, start, next.end_date, next.id);
        next.assignment_id = this.store.accept(next.user_id, zone, start, next.end_date, now).assignment.id;
      } else {
        next.end_date = this.store.end(next.assignment_id!, now).assignment.end_date;
      }
      next.status = 'Accepted';
      next.resolved_at = now;
      next.resolved_by = actorId;
    }
    this.requests.set(id, next);
    return structuredClone(next);
  }

  reject(actorId: string, id: string, reason?: string): AssignmentRequest {
    const actor = this.activeUser(actorId);
    const current = this.requireRequest(id);
    this.pending(current);
    // Chủ/người đề xuất có thể rút lời mời; người nhận có thể từ chối, kể cả sau bước chủ duyệt.
    if (actor.id !== current.owner_id && actor.id !== current.proposed_by
      && !(actor.id === current.user_id && current.action === 'Assign')) {
      throw new ForbiddenException('Bạn không có quyền từ chối lời mời này');
    }
    const next: AssignmentRequest = { ...current, status: 'Rejected', resolved_by: actorId,
      resolved_at: new Date().toISOString(), rejection_reason: reason ?? null };
    this.requests.set(id, next);
    return structuredClone(next);
  }

  end(actorId: string, id: string): AssignmentHistory {
    const entry = this.store.get(id);
    const { actor } = this.managementContext(actorId, entry.assignment.zone_id);
    if (actor.role !== 'Farmer') { throw new ForbiddenException('Admin phải đề xuất kết thúc để chủ Farmer duyệt'); }
    return this.store.end(id, new Date().toISOString());
  }

  endRequest(actorId: string, id: string): AssignmentRequest {
    const entry = this.store.get(id);
    const { actor, zone, ownerId } = this.managementContext(actorId, entry.assignment.zone_id);
    if (actor.role !== 'Admin') { throw new ForbiddenException('Chủ Farmer dùng endpoint kết thúc trực tiếp'); }
    if (!assignmentActive(entry.assignment)) { throw new ConflictException('Chỉ đề xuất kết thúc phân công đang có hiệu lực'); }
    if ([...this.requests.values()].some((request) => request.assignment_id === id && request.action === 'End' && request.status === 'Pending')) {
      throw new ConflictException('Phân công đã có đề xuất kết thúc đang chờ');
    }
    return this.addRequest(actor, zone, ownerId, 'End', entry.assignment.user_id, entry.assignment.start_date, entry.assignment.end_date, id);
  }

  // Các module nhật ký/điều khiển sau này phải gọi tại lúc ghi hoặc thực thi, không tin quyền client.
  assertCanWork(actorId: string, zoneId: string): void {
    this.activeFarmer(actorId);
    this.zones.getRecord(zoneId);
    if (!this.store.hasActive(actorId, zoneId)) { throw new ForbiddenException('Farmer không có phân công đang hiệu lực tại Zone'); }
  }

  // Các field của event phải lấy từ bản ghi gốc đã lưu, không nhận bằng chứng này từ Body.
  assertCanCorrect(actorId: string, event: { assignment_id: string; zone_id: string; author_id: string; created_at: string }): void {
    this.activeFarmer(actorId);
    const { assignment } = this.store.get(event.assignment_id);
    if (assignment.user_id !== actorId || assignment.zone_id !== event.zone_id || event.author_id !== actorId
      || !assignmentAllowsCorrection(assignment, event.created_at)) {
      throw new ForbiddenException('Chỉ tác giả được correction trong phân công gốc hoặc tối đa 15 ngày sau end_date');
    }
  }

  private managementContext(actorId: string, zoneId: string) {
    const actor = this.activeUser(actorId);
    const zone = this.zones.getRecord(zoneId);
    const farm = this.farms.getRecord(zone.farm_id);
    if (actor.role !== 'Admin' && !(actor.role === 'Farmer' && actor.id === farm.owner_id)) {
      throw new ForbiddenException('Chỉ chủ Farmer hoặc Admin được đề xuất phân công');
    }
    this.activeFarmer(farm.owner_id);
    return { actor, zone, ownerId: farm.owner_id };
  }

  private validateContext(request: AssignmentRequest): TestZone {
    const { actor, zone, ownerId } = this.managementContext(request.proposed_by, request.zone_id);
    if (actor.role !== request.proposed_role || ownerId !== request.owner_id) { throw new ConflictException('Vai trò người đề xuất hoặc chủ Farm đã thay đổi'); }
    if (request.action === 'Assign') {
      this.activeFarmer(request.user_id);
      // Người nhận đã đọc snapshot; đổi dữ liệu Zone trước khi nhận thì cần lời mời mới.
      if (JSON.stringify(zone) !== JSON.stringify(request.zone_snapshot)) { throw new ConflictException('Zone đã thay đổi; cần lập lời mời mới'); }
    } else if (!assignmentActive(this.store.get(request.assignment_id!).assignment)) {
      throw new ConflictException('Phân công không còn hiệu lực');
    }
    return zone;
  }

  private addRequest(actor: TestUser, zone: TestZone, ownerId: string, action: 'Assign' | 'End', userId: string,
    start: string, end: string | null, assignmentId: string | null): AssignmentRequest {
    if (this.requests.size >= 2000) { throw new HttpException('Bộ nhớ lời mời phân công đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const required: AssignmentRequest['required_approvals'] = [];
    if (actor.role === 'Admin') { required.push({ purpose: 'Owner', user_id: ownerId, approved_at: null }); }
    if (action === 'Assign') { required.push({ purpose: 'Assignee', user_id: userId, approved_at: null }); }
    const value: AssignmentRequest = { id: randomUUID(), action, status: 'Pending', zone_id: zone.id, owner_id: ownerId,
      user_id: userId, proposed_by: actor.id, proposed_role: actor.role as 'Admin' | 'Farmer', start_date: start, end_date: end,
      assignment_id: assignmentId, zone_snapshot: zone, required_approvals: required, created_at: new Date().toISOString(),
      resolved_at: null, resolved_by: null, rejection_reason: null };
    this.requests.set(value.id, value);
    return structuredClone(value);
  }

  private assertAvailable(zoneId: string, start: string, end: string | null, exceptRequestId?: string): void {
    this.store.assertAvailable(zoneId, start, end);
    if ([...this.requests.values()].some((request) => request.id !== exceptRequestId && request.zone_id === zoneId
      && request.action === 'Assign' && request.status === 'Pending'
      && intervalsOverlap(start, end, request))) {
      throw new ConflictException('Zone có lời mời Pending giao nhau; xử lý lời mời đó trước');
    }
  }

  private canReadEntry(actor: TestUser, entry: AssignmentHistory): boolean {
    return actor.id === entry.assignment.user_id || this.canReadManagement(actor, entry.zone_snapshot.farm_id);
  }

  private canReadRequest(actor: TestUser, request: AssignmentRequest): boolean {
    return actor.role === 'Admin' || actor.id === request.owner_id || actor.id === request.user_id
      || this.canReadManagement(actor, request.zone_snapshot.farm_id);
  }

  private canReadManagement(actor: TestUser, farmId: string): boolean {
    try { this.farms.get(actor.id, farmId); return true; }
    catch (error) { if (error instanceof NotFoundException) { return false; } throw error; }
  }

  private historyResponse(entry: AssignmentHistory, now: number) {
    const end = entry.assignment.end_date;
    return { ...entry, active: assignmentActive(entry.assignment, now), correction_grace_days: CORRECTION_GRACE_DAYS,
      correction_deadline: end === null ? null : new Date(Date.parse(end) + CORRECTION_GRACE_DAYS * 86400000).toISOString() };
  }

  private activeUser(id: string): TestUser {
    const user = this.users.findById(id);
    if (user?.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return user;
  }

  private activeFarmer(id: string): TestUser {
    const user = this.activeUser(id);
    if (user.role !== 'Farmer') { throw new ForbiddenException('Phân công chỉ dành cho Farmer Active'); }
    return user;
  }

  private pending(request: AssignmentRequest): void {
    if (request.status !== 'Pending') { throw new ConflictException('Lời mời đã được xử lý'); }
  }

  private requireRequest(id: string): AssignmentRequest {
    const request = this.requests.get(id);
    if (!request) { throw new NotFoundException('Không tìm thấy lời mời phân công'); }
    return request;
  }

  private date(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) { throw new BadRequestException('Ngày phân công không hợp lệ'); }
    return new Date(parsed).toISOString();
  }

  private page<T>(items: T[], query: { limit: number; offset: number }) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
}
