import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { MockCooperativeStore } from '../users/mock-cooperative.store';
import { CreateFarmRequestDto, FarmDetailsDto, FarmListDto, FarmPageDto, FarmRequestListDto, UpdateFarmRequestDto } from './farms.dto';
import { FarmAction, FarmApproval, FarmChangeRequest, FarmLeaveNotification, TestFarm } from './farms.types';
import { FarmAreaBudget } from './farm-area-budget';

interface StoredRequest { value: FarmChangeRequest; farmVersion: number | null }

@Injectable()
export class FarmsService {
  private readonly farms = new Map<string, TestFarm>();
  private readonly versions = new Map<string, number>();
  private readonly requests = new Map<string, StoredRequest>();
  private readonly notifications = new Map<string, FarmLeaveNotification>();

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(MockCooperativeStore) private readonly cooperatives: MockCooperativeStore,
    @Inject(FarmAreaBudget) private readonly areaBudget: FarmAreaBudget,
  ) {}

  list(actorId: string, query: FarmListDto) {
    const actor = this.activeUser(actorId);
    const q = query.q?.toLocaleLowerCase('vi') ?? '';
    const visible = [...this.farms.values()].filter((farm) => this.canReadFarm(actor, farm)
      && (!q || `${farm.address} ${farm.certificate_number}`.toLocaleLowerCase('vi').includes(q)));
    return this.page(visible, query);
  }

  get(actorId: string, farmId: string): TestFarm {
    const actor = this.activeUser(actorId);
    const farm = this.requireFarm(farmId);
    if (!this.canReadFarm(actor, farm)) { throw new NotFoundException('Không tìm thấy Farm trong phạm vi truy cập'); }
    return structuredClone(farm);
  }

  listCooperatives(actorId: string, query: FarmPageDto) {
    const actor = this.activeUser(actorId);
    // Farmer cần danh sách HTX để chọn nơi xin gia nhập; Manager chỉ xem HTX của mình.
    const items = this.cooperatives.list().filter((coop) => actor.role !== 'Manager' || coop.manager_id === actor.id);
    return this.page(items, query);
  }

  // Chỉ dùng bên trong các service. HTTP vẫn phải đi qua get(actorId, farmId).
  getRecord(farmId: string): TestFarm { return structuredClone(this.requireFarm(farmId)); }

  createRequest(actorId: string, input: CreateFarmRequestDto): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    this.requireProposer(actor);
    const ownerId = input.owner_id ?? (actor.role === 'Farmer' ? actor.id : undefined);
    if (!ownerId) { throw new BadRequestException('Admin phải chỉ định owner_id của Farmer'); }
    if (actor.role === 'Farmer' && actor.id !== ownerId) { throw new ForbiddenException('Farmer chỉ tạo Farm cho chính mình'); }
    this.activeOwner(ownerId);
    this.requireFarmCapacity();
    const changes: FarmDetailsDto = {
      area_size: input.area_size, address: input.address, certificate_number: input.certificate_number,
      longitude: input.longitude, latitude: input.latitude,
    };
    return this.addRequest(actor, ownerId, 'Create', null, changes, null);
  }

  updateRequest(actorId: string, farmId: string, changes: UpdateFarmRequestDto): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const farm = this.writableFarm(actor, farmId);
    if (!Object.keys(changes).length) { throw new BadRequestException('Cần ít nhất một field thay đổi'); }
    if (!Object.entries(changes).some(([key, value]) => farm[key as keyof FarmDetailsDto] !== value)) {
      throw new BadRequestException('Dữ liệu đề xuất không khác dữ liệu Farm hiện tại');
    }
    return this.addRequest(actor, farm.owner_id, 'Update', farm, changes, farm.cooperative_id);
  }

  joinRequest(actorId: string, farmId: string, cooperativeId: string): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const farm = this.writableFarm(actor, farmId);
    if (farm.cooperative_id) { throw new ConflictException('Farm đang thuộc HTX; phải rời trước khi xin gia nhập HTX khác'); }
    const cooperative = this.cooperatives.get(cooperativeId);
    const manager = cooperative.manager_id ? this.users.findById(cooperative.manager_id) : undefined;
    if (manager?.role !== 'Manager' || manager.status !== 'Active') {
      throw new ConflictException('HTX cần có Manager Active để xét gia nhập');
    }
    return this.addRequest(actor, farm.owner_id, 'Join', farm, {}, cooperativeId, manager.id);
  }

  leaveRequest(actorId: string, farmId: string): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const farm = this.writableFarm(actor, farmId);
    if (!farm.cooperative_id) { throw new ConflictException('Farm chưa thuộc HTX'); }
    return this.addRequest(actor, farm.owner_id, 'Leave', farm, {}, farm.cooperative_id);
  }

  listRequests(actorId: string, query: FarmRequestListDto) {
    const actor = this.activeUser(actorId);
    const items = [...this.requests.values()].map((item) => item.value)
      .filter((item) => this.canReadRequest(actor, item) && (!query.status || item.status === query.status));
    return this.page(items, query);
  }

  getRequest(actorId: string, id: string): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const request = this.requireRequest(id).value;
    if (!this.canReadRequest(actor, request)) { throw new NotFoundException('Không tìm thấy yêu cầu trong phạm vi truy cập'); }
    return structuredClone(request);
  }

  approve(actorId: string, requestId: string): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const stored = this.requireRequest(requestId);
    const approvalIndex = this.requireReviewer(actor, stored.value);
    this.validateCurrentContext(stored);
    const next = structuredClone(stored.value);
    const now = new Date().toISOString();
    next.required_approvals[approvalIndex].approved_by = actor.id;
    next.required_approvals[approvalIndex].approved_at = now;

    // Duyệt từng bước vẫn giữ Pending. Chỉ ghi Farm khi đủ tất cả chữ ký và còn đúng quyền hiện tại.
    // Không có await giữa kiểm tra và commit: hai HTTP request không thể ghi nửa chừng trong demo một process.
    if (next.required_approvals.every((approval) => approval.approved_by)) {
      this.validateApprovedUsers(next);
      this.applyAccepted(next, now);
      next.status = 'Accepted';
      next.resolved_at = now;
    }
    stored.value = next;
    return structuredClone(next);
  }

  reject(actorId: string, requestId: string, reason?: string): FarmChangeRequest {
    const actor = this.activeUser(actorId);
    const stored = this.requireRequest(requestId);
    this.requireReviewer(actor, stored.value);
    const next = structuredClone(stored.value);
    next.status = 'Rejected';
    next.rejected_by = actor.id;
    next.rejection_reason = reason ?? null;
    next.resolved_at = new Date().toISOString();
    stored.value = next;
    return structuredClone(next);
  }

  listNotifications(actorId: string, query: FarmPageDto) {
    const actor = this.activeUser(actorId);
    if (actor.role !== 'Manager') { throw new ForbiddenException('Thông báo rời HTX dành cho Manager nhận thông báo'); }
    const items = [...this.notifications.values()].filter((item) => item.recipient_id === actor.id);
    return this.page(items, query);
  }

  private addRequest(actor: TestUser, ownerId: string, action: FarmAction, farm: TestFarm | null,
    changes: Partial<FarmDetailsDto>, cooperativeId: string | null, managerId?: string): FarmChangeRequest {
    this.requireProposer(actor);
    this.activeOwner(ownerId);
    if (farm && [...this.requests.values()].some((item) => item.value.farm_id === farm.id && item.value.status === 'Pending')) {
      throw new ConflictException('Farm đã có yêu cầu đang chờ; hãy xử lý yêu cầu đó trước');
    }
    if (this.requests.size >= 2000) { throw new HttpException('Bộ nhớ yêu cầu test đã đầy; restart để bắt đầu lại', HttpStatus.TOO_MANY_REQUESTS); }
    const approvals: FarmApproval[] = [{
      role: actor.role === 'Admin' ? 'Farmer' : 'Admin', user_id: actor.role === 'Admin' ? ownerId : null,
      approved_by: null, approved_at: null,
    }];
    if (managerId) { approvals.push({ role: 'Manager', user_id: managerId, approved_by: null, approved_at: null }); }
    const value: FarmChangeRequest = {
      id: randomUUID(), action, status: 'Pending', farm_id: farm?.id ?? null, owner_id: ownerId,
      proposed_by: actor.id, proposed_role: actor.role as 'Admin' | 'Farmer', proposed_changes: structuredClone(changes),
      cooperative_id: cooperativeId, required_approvals: approvals, farm_snapshot: farm ? structuredClone(farm) : null,
      created_at: new Date().toISOString(), resolved_at: null, rejected_by: null, rejection_reason: null,
    };
    this.requests.set(value.id, { value, farmVersion: farm ? this.versions.get(farm.id)! : null });
    return structuredClone(value);
  }

  private validateCurrentContext(stored: StoredRequest): void {
    const request = stored.value;
    this.activeOwner(request.owner_id);
    const proposer = this.users.findById(request.proposed_by);
    if (proposer?.status !== 'Active' || proposer.role !== request.proposed_role) {
      throw new ConflictException('Tài khoản đề xuất không còn đúng vai trò hoặc không Active');
    }
    if (request.farm_id) {
      const farm = this.requireFarm(request.farm_id);
      if (farm.owner_id !== request.owner_id || this.versions.get(farm.id) !== stored.farmVersion) {
        throw new ConflictException('Farm đã thay đổi; cần đề xuất mới');
      }
      if (request.action === 'Join' && farm.cooperative_id) { throw new ConflictException('Farm đã thuộc HTX'); }
      if (request.action === 'Leave' && farm.cooperative_id !== request.cooperative_id) {
        throw new ConflictException('HTX của Farm đã thay đổi');
      }
    }
    if (request.action === 'Join') {
      const cooperative = this.cooperatives.get(request.cooperative_id!);
      const approval = request.required_approvals.find((item) => item.role === 'Manager')!;
      const manager = approval.user_id ? this.users.findById(approval.user_id) : undefined;
      if (cooperative.manager_id !== approval.user_id || manager?.role !== 'Manager' || manager.status !== 'Active') {
        throw new ConflictException('Manager của HTX đã thay đổi hoặc không Active; cần xử lý lại yêu cầu');
      }
    }
  }

  private validateApprovedUsers(request: FarmChangeRequest): void {
    for (const approval of request.required_approvals) {
      const reviewer = this.users.findById(approval.approved_by!);
      if (reviewer?.status !== 'Active' || reviewer.role !== approval.role || (approval.user_id && reviewer.id !== approval.user_id)) {
        throw new ConflictException('Người đã duyệt không còn đủ quyền; Farm chưa được thay đổi');
      }
    }
  }

  private applyAccepted(request: FarmChangeRequest, now: string): void {
    if (request.action === 'Create') {
      this.requireFarmCapacity();
      const farm: TestFarm = {
        ...request.proposed_changes as FarmDetailsDto, id: randomUUID(), owner_id: request.owner_id,
        cooperative_id: null, join_cooperative_date: null,
      };
      this.farms.set(farm.id, farm);
      this.versions.set(farm.id, 1);
      this.activeOwner(farm.owner_id).is_owner = true;
      request.farm_id = farm.id;
      return;
    }
    const farm = this.requireFarm(request.farm_id!);
    if (request.action === 'Update') {
      this.areaBudget.assertCapacity(farm.id, request.proposed_changes.area_size ?? farm.area_size);
      this.farms.set(farm.id, { ...farm, ...request.proposed_changes });
    } else if (request.action === 'Join') {
      this.farms.set(farm.id, { ...farm, cooperative_id: request.cooperative_id, join_cooperative_date: now });
    } else {
      const cooperative = this.cooperatives.get(farm.cooperative_id!);
      const manager = cooperative.manager_id ? this.users.findById(cooperative.manager_id) : undefined;
      if (manager?.role !== 'Manager') { throw new ConflictException('HTX không có Manager hợp lệ để nhận thông báo'); }
      const notification: FarmLeaveNotification = {
        id: randomUUID(), recipient_id: manager.id, type: 'FarmLeftCooperative', farm_id: farm.id,
        owner_id: farm.owner_id, cooperative_id: cooperative.id, request_id: request.id, created_at: now,
      };
      this.farms.set(farm.id, { ...farm, cooperative_id: null, join_cooperative_date: null });
      this.notifications.set(notification.id, notification);
    }
    this.versions.set(farm.id, this.versions.get(farm.id)! + 1);
  }

  private requireReviewer(actor: TestUser, request: FarmChangeRequest): number {
    if (request.status !== 'Pending') { throw new ConflictException('Yêu cầu đã được xử lý'); }
    if (actor.id === request.proposed_by) { throw new ForbiddenException('Không được tự duyệt hoặc tự từ chối yêu cầu của mình'); }
    const index = request.required_approvals.findIndex((approval) => approval.role === actor.role
      && (!approval.user_id || approval.user_id === actor.id));
    if (index < 0) { throw new ForbiddenException('Bạn không thuộc bên cần duyệt yêu cầu này'); }
    if (actor.role === 'Manager' && this.cooperatives.get(request.cooperative_id!).manager_id !== actor.id) {
      throw new ForbiddenException('Bạn không còn quản lý HTX này');
    }
    if (request.required_approvals[index].approved_by) { throw new ConflictException('Bên của bạn đã duyệt yêu cầu'); }
    return index;
  }

  private canReadFarm(actor: TestUser, farm: TestFarm): boolean {
    if (actor.role === 'Admin') { return true; }
    if (actor.role === 'Farmer') { return farm.owner_id === actor.id; }
    return Boolean(farm.cooperative_id && this.cooperatives.findByManager(actor.id)?.id === farm.cooperative_id);
  }

  private canReadRequest(actor: TestUser, request: FarmChangeRequest): boolean {
    if (actor.role === 'Admin') { return true; }
    if (actor.role === 'Farmer') { return request.owner_id === actor.id; }
    return request.action === 'Join' && request.required_approvals.some((approval) => approval.role === 'Manager' && approval.user_id === actor.id)
      && this.cooperatives.findByManager(actor.id)?.id === request.cooperative_id;
  }

  private activeUser(id: string): TestUser {
    const user = this.users.findById(id);
    if (!user || user.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return user;
  }

  private activeOwner(id: string): TestUser {
    const owner = this.users.findById(id);
    if (!owner || owner.role !== 'Farmer' || owner.status !== 'Active') {
      throw new ConflictException('Chủ Farm phải là tài khoản Farmer Active');
    }
    return owner;
  }

  private requireProposer(actor: TestUser): void {
    if (actor.role !== 'Admin' && actor.role !== 'Farmer') { throw new ForbiddenException('Chỉ Admin hoặc chủ Farmer được đề xuất thay đổi Farm'); }
  }

  private writableFarm(actor: TestUser, id: string): TestFarm {
    this.requireProposer(actor);
    const farm = this.requireFarm(id);
    if (actor.role === 'Farmer' && farm.owner_id !== actor.id) { throw new ForbiddenException('Chỉ chủ Farmer được đề xuất thay đổi Farm này'); }
    return farm;
  }

  private requireFarm(id: string): TestFarm {
    const farm = this.farms.get(id);
    if (!farm) { throw new NotFoundException('Không tìm thấy Farm'); }
    return farm;
  }

  private requireRequest(id: string): StoredRequest {
    const request = this.requests.get(id);
    if (!request) { throw new NotFoundException('Không tìm thấy yêu cầu Farm'); }
    return request;
  }

  private requireFarmCapacity(): void {
    if (this.farms.size >= 1000) { throw new HttpException('Bộ nhớ Farm test đã đầy; restart để bắt đầu lại', HttpStatus.TOO_MANY_REQUESTS); }
  }

  private page<T>(items: T[], query: FarmPageDto) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
}
