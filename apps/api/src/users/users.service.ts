import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MockUserStore, normalizeEmail, TestUser } from '../auth/mock-user.store';
import { hashPassword } from '../auth/password';
import { WindowRateLimiter } from '../auth/rate-limiter';
import { EmailVerificationService } from './email/email-verification.service';
import { MockCooperativeStore } from './mock-cooperative.store';
import { ApproveManagerDto, RegisterUserDto } from './users.dto';

@Injectable()
export class UsersService {
  private readonly limiter = new WindowRateLimiter();
  constructor(
    @Inject(MockUserStore) private readonly store: MockUserStore,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(MockCooperativeStore) private readonly cooperatives: MockCooperativeStore,
  ) {}

  async register(input: RegisterUserDto) {
    this.limiter.take('register', 5);
    if (!['Farmer', 'Manager'].includes(input.role)) {
      throw new BadRequestException('Chỉ đăng ký công khai Farmer hoặc Manager');
    }
    const gmail = input.gmail ? normalizeEmail(input.gmail) : null;
    const token = input.email_verification_token;
    if (input.role === 'Manager' && (!gmail || !token)) {
      throw new BadRequestException('Manager cần email đã xác minh trước khi đăng ký');
    }
    if (token && !gmail) {
      throw new BadRequestException('Bằng chứng xác minh phải đi kèm email');
    }
    this.store.assertAvailable(input.phone_number, gmail);
    if (token && gmail) { this.emailVerification.requireProof(input.phone_number, gmail, token); }
    const passwordHash = await hashPassword(input.password);
    // Sau await, proof và uniqueness được kiểm tra trong cùng khối commit đồng bộ.
    const createAccount = () => this.store.add({
      user_name: input.user_name,
      phone_number: input.phone_number,
      password: passwordHash,
      gmail,
      gmail_verify: Boolean(token),
      role: input.role,
      status: input.role === 'Manager' ? 'Pending' : 'Active',
      is_owner: false,
    });
    const user = token && gmail
      ? this.emailVerification.consumeForRegistration(input.phone_number, gmail, token, createAccount)
      : createAccount();
    return {
      message: user.status === 'Pending' ? 'Tài khoản đang chờ Admin duyệt' : 'Đăng ký thành công',
      user: this.store.publicUser(user),
    };
  }

  pendingManagers(adminId: string) {
    this.requireAdmin(adminId);
    return { users: this.store.pendingManagers().map((user) => this.store.publicUser(user)) };
  }

  listCooperatives(adminId: string) {
    this.requireAdmin(adminId);
    return { cooperatives: this.cooperatives.list() };
  }

  approve(adminId: string, userId: string, input: ApproveManagerDto) {
    this.requireAdmin(adminId);
    const user = this.pendingManager(userId);
    if (!user.gmail || !user.gmail_verify) {
      throw new ConflictException('Manager chưa xác minh email');
    }
    if (Boolean(input.cooperative_id) === Boolean(input.cooperative)) {
      throw new BadRequestException('Chọn đúng một cách: cooperative_id hoặc cooperative');
    }
    // Tạo/gắn HTX trước; lỗi/va chạm giữ nguyên Pending. Cả khối đồng bộ nên không có ghi nửa chừng.
    const cooperative = input.cooperative_id
      ? this.cooperatives.assign(input.cooperative_id, user.id)
      : this.cooperatives.create(input.cooperative!, user.id);
    user.status = 'Active';
    this.store.revokeTokens(user.id);
    return {
      message: 'Đã duyệt Manager và gắn HTX',
      user: this.store.publicUser(user),
      cooperative: { ...cooperative },
    };
  }

  reject(adminId: string, userId: string) {
    this.requireAdmin(adminId);
    const user = this.pendingManager(userId);
    user.status = 'Reject';
    this.store.revokeTokens(user.id);
    return { message: 'Đã từ chối tài khoản Manager', user: this.store.publicUser(user) };
  }

  private pendingManager(id: string): TestUser {
    const user = this.store.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.role !== 'Manager' || user.status !== 'Pending') {
      throw new ConflictException('Chỉ xử lý Manager đang Pending');
    }
    return user;
  }

  private requireAdmin(id: string): void {
    const admin = this.store.findById(id);
    if (admin?.role !== 'Admin' || admin.status !== 'Active') {
      throw new ForbiddenException('Chỉ Admin được duyệt tài khoản');
    }
  }
}
