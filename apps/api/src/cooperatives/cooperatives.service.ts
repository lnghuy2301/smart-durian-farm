import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable,
  NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { MockUserStore, TestUser } from '../auth/mock-user.store';
import { OtpProvider } from '../auth/sms/otp.provider';
import { WindowRateLimiter } from '../auth/rate-limiter';
import { FarmsService } from '../farms/farms.service';
import { MockCooperativeStore, TestCooperative } from '../users/mock-cooperative.store';
import { CreateCooperativeDto } from '../users/users.dto';
import { EmailSender } from '../users/email/email.sender';
import { COOPERATIVE_OTP_PROVIDER } from './cooperative-otp.provider';
import { CooperativeListDto, CooperativePageDto, ManagerCooperativeUpdateDto, UpdateCooperativeDto } from './cooperatives.dto';
import { CooperativeNotification, CooperativeUpdateStatus, StoredCooperativeUpdate } from './cooperatives.types';

export const COOPERATIVE_WARNING_DAYS = 7;
export const COOPERATIVE_DELETE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_TTL_MS = 10 * 60 * 1000;
const SMS_TTL_MS = 5 * 60 * 1000;
const TERMINAL: CooperativeUpdateStatus[] = ['Accepted', 'Cancelled', 'Expired', 'Failed'];

@Injectable()
export class CooperativesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly requests = new Map<string, StoredCooperativeUpdate>();
  private readonly notifications = new Map<string, CooperativeNotification>();
  private readonly limiter = new WindowRateLimiter();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(MockCooperativeStore) private readonly store: MockCooperativeStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(EmailSender) private readonly emailSender: EmailSender,
    @Inject(COOPERATIVE_OTP_PROVIDER) private readonly sms: OtpProvider,
  ) {}

  onApplicationBootstrap(): void {
    this.sweep();
    this.timer = setInterval(() => this.sweep(), 60000);
    this.timer.unref();
  }

  onApplicationShutdown(): void { if (this.timer) { clearInterval(this.timer); } }

  // Kiểm tra và xóa đồng bộ trong một process. Manager gắn trước sweep sẽ chặn xóa.
  sweep(): void {
    const now = Date.now();
    for (const entry of this.requests.values()) { this.expire(entry, now); }
    for (const cooperative of this.store.list()) {
      if (cooperative.manager_id) { continue; }
      const age = now - this.store.lifecycle(cooperative.id).createdAt;
      if (age >= COOPERATIVE_WARNING_DAYS * DAY_MS) { this.notify(cooperative, 'ManagerMissing', now); }
      if (age < COOPERATIVE_DELETE_DAYS * DAY_MS) { continue; }
      if (this.farms.hasCooperativeReferences(cooperative.id)
        || [...this.requests.values()].some((entry) => entry.value.cooperative_id === cooperative.id)) {
        this.notify(cooperative, 'DeletionBlocked', now);
        continue;
      }
      // Không xóa nếu không còn dung lượng để giữ thông báo/audit của thao tác xóa.
      if (!this.notify(cooperative, 'CooperativeDeleted', now)) { continue; }
      this.store.removeUnmanaged(cooperative.id);
    }
  }

  list(actorId: string, query: CooperativeListDto) {
    const actor = this.activeUser(actorId);
    this.sweep();
    const q = query.q?.toLocaleLowerCase();
    const items = this.store.list().filter((coop) => (actor.role !== 'Manager' || coop.manager_id === actorId)
      && (!q || [coop.cooperative_name, coop.certificate_number, coop.address].some((text) => text.toLocaleLowerCase().includes(q))));
    return this.page(items, query);
  }

  get(actorId: string, id: string) {
    const actor = this.activeUser(actorId);
    this.sweep();
    const cooperative = this.store.get(id);
    if (actor.role === 'Manager' && cooperative.manager_id !== actorId) { throw new NotFoundException('Không tìm thấy HTX'); }
    const { createdAt } = this.store.lifecycle(id);
    return { ...cooperative, lifecycle: { created_at: new Date(createdAt).toISOString(),
      warning_at: cooperative.manager_id ? null : new Date(createdAt + COOPERATIVE_WARNING_DAYS * DAY_MS).toISOString(),
      deletion_due_at: cooperative.manager_id ? null : new Date(createdAt + COOPERATIVE_DELETE_DAYS * DAY_MS).toISOString() } };
  }

  create(actorId: string, input: CreateCooperativeDto) {
    this.admin(actorId);
    this.sweep();
    return this.store.create(input, null);
  }

  update(actorId: string, id: string, input: UpdateCooperativeDto) {
    this.admin(actorId);
    this.sweep();
    const changes = this.requireChanges(this.store.get(id), input);
    return this.store.update(id, changes);
  }

  listNotifications(actorId: string, query: CooperativePageDto) {
    this.admin(actorId);
    this.sweep();
    return this.page([...this.notifications.values()], query);
  }

  async createUpdateRequest(actorId: string, id: string, input: ManagerCooperativeUpdateDto) {
    const manager = this.manager(actorId, id);
    this.sweep();
    const cooperative = this.store.get(id);
    const changes = this.requireChanges(cooperative, input, true);
    if ([...this.requests.values()].some((entry) => entry.value.manager_id === actorId && (entry.busy || !TERMINAL.includes(entry.value.status)))) {
      throw new ConflictException('Manager đã có yêu cầu sửa HTX đang chờ; hoàn tất hoặc hủy trước');
    }
    if (this.requests.size >= 500) { throw new HttpException('Bộ nhớ yêu cầu sửa HTX đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    const now = Date.now();
    const entry: StoredCooperativeUpdate = {
      value: { id: randomUUID(), cooperative_id: id, manager_id: actorId, proposed_changes: changes,
        status: 'EmailPending', created_at: new Date(now).toISOString(), resolved_at: null,
        expires_at: new Date(now + EMAIL_TTL_MS).toISOString(), email_verified_at: null },
      cooperativeVersion: this.store.lifecycle(id).version, tokenVersion: this.users.versionOf(actorId),
      email: manager.gmail!, phone: manager.phone_number, emailAttempts: 0, smsAttempts: 0,
      emailValidUntil: 0, nextEmailSendAt: 0, nextSmsSendAt: 0, busy: false,
    };
    this.requests.set(entry.value.id, entry);
    try { return await this.sendEmailEntry(entry); }
    catch (error) { this.finish(entry, 'Failed'); throw error; }
  }

  listRequests(actorId: string, query: CooperativePageDto) {
    const actor = this.activeUser(actorId);
    if (actor.role === 'Farmer') { throw new ForbiddenException('Farmer không đọc yêu cầu sửa HTX của Manager'); }
    this.sweep();
    return this.page([...this.requests.values()].filter((entry) => actor.role === 'Admin' || entry.value.manager_id === actorId)
      .map((entry) => entry.value), query);
  }

  getRequest(actorId: string, id: string) {
    const entry = this.visibleRequest(actorId, id);
    this.expire(entry, Date.now());
    return structuredClone(entry.value);
  }

  async resendEmail(actorId: string, id: string) {
    const entry = this.mutableRequest(actorId, id, ['EmailPending']);
    return this.sendEmailEntry(entry);
  }

  verifyEmail(actorId: string, id: string, code: string) {
    this.limiter.take('cooperative-email-verify', 20);
    const entry = this.mutableRequest(actorId, id, ['EmailPending']);
    if (entry.emailAttempts >= 5 || !entry.emailDigest || !entry.emailSalt) { throw this.invalidOtp(); }
    entry.emailAttempts++;
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(entry.emailDigest, this.digest(`${entry.emailSalt}:${code}`))) {
      if (entry.emailAttempts >= 5) { this.finish(entry, 'Failed'); }
      throw this.invalidOtp();
    }
    const now = Date.now();
    entry.emailDigest = undefined;
    entry.emailSalt = undefined;
    entry.emailValidUntil = now + EMAIL_TTL_MS;
    entry.value.email_verified_at = new Date(now).toISOString();
    entry.value.expires_at = new Date(entry.emailValidUntil).toISOString();
    entry.value.status = 'EmailVerified';
    return structuredClone(entry.value);
  }

  async sendSms(actorId: string, id: string) {
    const entry = this.mutableRequest(actorId, id, ['EmailVerified', 'SmsPending']);
    const now = Date.now();
    if (now >= entry.emailValidUntil) { this.finish(entry, 'Expired'); throw this.invalidOtp(); }
    if (now < entry.nextSmsSendAt) { throw this.cooldown(); }
    this.limiter.take('cooperative-sms-send', 5);
    entry.nextSmsSendAt = now + 60000;
    entry.smsProof = undefined;
    entry.smsAttempts = 0;
    entry.value.status = 'SmsSending';
    entry.busy = true;
    entry.value.expires_at = new Date(now + SMS_TTL_MS).toISOString();
    try {
      const proof = await this.sms.issue(entry.phone, now + SMS_TTL_MS);
      this.checkContext(entry);
      if (Date.now() >= Date.parse(entry.value.expires_at)) { this.finish(entry, 'Expired'); throw this.invalidOtp(); }
      entry.smsProof = proof;
      entry.value.status = 'SmsPending';
      return structuredClone(entry.value);
    } catch (error) { this.finish(entry, 'Failed'); throw error; }
    finally { entry.busy = false; }
  }

  async verifySms(actorId: string, id: string, code: string) {
    this.limiter.take('cooperative-sms-verify', 20);
    const entry = this.mutableRequest(actorId, id, ['SmsPending']);
    if (!entry.smsProof || entry.smsAttempts >= 5 || !/^\d{6}$/.test(code)) { throw this.invalidOtp(); }
    entry.smsAttempts++;
    entry.value.status = 'SmsChecking';
    entry.busy = true;
    let matches: boolean;
    try { matches = await this.sms.verify(entry.smsProof, code); }
    catch (error) { this.finish(entry, 'Failed'); throw error; }
    finally { entry.busy = false; }
    // Luôn kiểm tra lại sau await: Admin có thể sửa HTX hoặc tài khoản bị khóa trong lúc Verify chờ.
    try { this.checkContext(entry); }
    catch (error) { this.finish(entry, 'Failed'); throw error; }
    if (Date.now() >= Date.parse(entry.value.expires_at)) { this.finish(entry, 'Expired'); throw this.invalidOtp(); }
    if (!matches) {
      if (entry.smsAttempts >= 5) { this.finish(entry, 'Failed'); }
      else { entry.value.status = 'SmsPending'; }
      throw this.invalidOtp();
    }
    const cooperative = this.store.update(entry.value.cooperative_id, entry.value.proposed_changes);
    this.finish(entry, 'Accepted');
    return { request: structuredClone(entry.value), cooperative };
  }

  cancel(actorId: string, id: string) {
    const entry = this.mutableRequest(actorId, id, ['EmailPending', 'EmailVerified', 'SmsPending']);
    this.finish(entry, 'Cancelled');
    return structuredClone(entry.value);
  }

  testSms(actorId: string, id: string) {
    const entry = this.mutableRequest(actorId, id, ['SmsPending']);
    if (this.sms.mode !== 'mock') { throw new NotFoundException(); }
    return { mode: 'mock', messages: this.sms.messages(entry.phone) };
  }

  private async sendEmailEntry(entry: StoredCooperativeUpdate) {
    const now = Date.now();
    if (now < entry.nextEmailSendAt) { throw this.cooldown(); }
    this.limiter.take('cooperative-email-send', 5);
    entry.nextEmailSendAt = now + 60000;
    entry.emailAttempts = 0;
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    entry.emailSalt = randomBytes(16).toString('hex');
    entry.emailDigest = this.digest(`${entry.emailSalt}:${code}`);
    entry.value.status = 'EmailSending';
    entry.busy = true;
    entry.value.expires_at = new Date(now + EMAIL_TTL_MS).toISOString();
    try {
      await this.emailSender.sendVerification(entry.email, code, 'cooperative-update');
      this.checkContext(entry);
      if (Date.now() >= Date.parse(entry.value.expires_at)) { this.finish(entry, 'Expired'); throw this.invalidOtp(); }
      entry.value.status = 'EmailPending';
      return structuredClone(entry.value);
    } catch (error) { this.finish(entry, 'Failed'); throw error; }
    finally { entry.busy = false; }
  }

  private checkContext(entry: StoredCooperativeUpdate): void {
    const actor = this.manager(entry.value.manager_id, entry.value.cooperative_id);
    if (actor.gmail !== entry.email || actor.phone_number !== entry.phone || this.users.versionOf(actor.id) !== entry.tokenVersion
      || this.store.lifecycle(entry.value.cooperative_id).version !== entry.cooperativeVersion) {
      throw new ConflictException('HTX hoặc tài khoản đã thay đổi; cần tạo yêu cầu và xác minh lại');
    }
    if (TERMINAL.includes(entry.value.status)) { throw new ConflictException('Yêu cầu đã được xử lý'); }
  }

  private visibleRequest(actorId: string, id: string): StoredCooperativeUpdate {
    const actor = this.activeUser(actorId);
    const entry = this.requests.get(id);
    if (!entry || (actor.role !== 'Admin' && entry.value.manager_id !== actorId)) { throw new NotFoundException('Không tìm thấy yêu cầu sửa HTX'); }
    return entry;
  }

  private mutableRequest(actorId: string, id: string, statuses: CooperativeUpdateStatus[]) {
    const entry = this.visibleRequest(actorId, id);
    if (actorId !== entry.value.manager_id) { throw new ForbiddenException('Chỉ Manager gửi yêu cầu được xác minh'); }
    this.expire(entry, Date.now());
    if (entry.busy) { throw new ConflictException('Yêu cầu đang gửi hoặc xác minh OTP'); }
    if (!statuses.includes(entry.value.status)) { throw new ConflictException('Yêu cầu không ở bước xác minh phù hợp'); }
    try { this.checkContext(entry); }
    catch (error) { this.finish(entry, 'Failed'); throw error; }
    return entry;
  }

  private expire(entry: StoredCooperativeUpdate, now: number): void {
    if (!TERMINAL.includes(entry.value.status) && now >= Date.parse(entry.value.expires_at)) { this.finish(entry, 'Expired'); }
  }

  private finish(entry: StoredCooperativeUpdate, status: CooperativeUpdateStatus): void {
    if (!TERMINAL.includes(entry.value.status)) {
      entry.value.status = status;
      entry.value.resolved_at = new Date(Date.now()).toISOString();
    }
    entry.emailDigest = undefined;
    entry.emailSalt = undefined;
    entry.smsProof = undefined;
    this.sms.clear(entry.phone);
  }

  private notify(cooperative: TestCooperative, type: CooperativeNotification['type'], now: number): boolean {
    const key = `${cooperative.id}:${type}`;
    if (this.notifications.has(key)) { return true; }
    if (this.notifications.size >= 2000) { return false; }
    const { createdAt } = this.store.lifecycle(cooperative.id);
    this.notifications.set(key, { id: randomUUID(), type, cooperative_id: cooperative.id,
      cooperative_name: cooperative.cooperative_name, created_at: new Date(now).toISOString(),
      manager_deadline: new Date(createdAt + COOPERATIVE_DELETE_DAYS * DAY_MS).toISOString() });
    return true;
  }

  private requireChanges(cooperative: TestCooperative, input: UpdateCooperativeDto, manager = false): UpdateCooperativeDto {
    const fields = ['cooperative_name', 'director', 'address', 'contact_number', ...(manager ? [] : ['certificate_number'])];
    if (Object.keys(input).some((key) => !fields.includes(key))) { throw new BadRequestException('Thông tin không thuộc phạm vi được sửa'); }
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as UpdateCooperativeDto;
    if (!Object.entries(changes).some(([key, value]) => cooperative[key as keyof CreateCooperativeDto] !== value)) {
      throw new BadRequestException('Cần ít nhất một thông tin thực sự thay đổi');
    }
    return changes;
  }

  private activeUser(id: string): TestUser {
    const user = this.users.findById(id);
    if (!user || user.status !== 'Active') { throw new ForbiddenException('Tài khoản phải Active'); }
    return user;
  }

  private admin(id: string): void { if (this.activeUser(id).role !== 'Admin') { throw new ForbiddenException('Chỉ Admin tạo/sửa trực tiếp HTX'); } }

  private manager(actorId: string, id: string): TestUser {
    const actor = this.activeUser(actorId);
    if (actor.role !== 'Manager' || this.store.get(id).manager_id !== actorId) { throw new ForbiddenException('Chỉ Manager của HTX được gửi thay đổi'); }
    if (!actor.gmail || !actor.gmail_verify) { throw new ConflictException('Manager phải có email tài khoản đã xác minh'); }
    return actor;
  }

  private page<T>(items: T[], query: CooperativePageDto) {
    return { items: structuredClone(items.slice(query.offset, query.offset + query.limit)), total: items.length, limit: query.limit, offset: query.offset };
  }
  private digest(value: string): Buffer { return createHash('sha256').update(value).digest(); }
  private invalidOtp() { return new BadRequestException('OTP không hợp lệ, đã dùng hoặc hết hạn'); }
  private cooldown() { return new HttpException('Đợi 60 giây trước khi gửi lại OTP', HttpStatus.TOO_MANY_REQUESTS); }
}
