import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MockAuthConfig } from '../config/environment';
import { hashPassword } from './password';

export type UserRole = 'Farmer' | 'Manager' | 'Admin';
export type UserStatus = 'Active' | 'Locked' | 'Pending' | 'Reject';

export interface TestUser {
  id: string;
  user_name: string;
  phone_number: string;
  gmail: string | null;
  gmail_verify: boolean;
  password: string;
  role: UserRole;
  status: UserStatus;
  is_owner: boolean;
  created_at: string;
}

export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

// Chỉ dùng để chống đăng ký trùng số VN qua dạng 0/84/+84, không đổi cách login hiện tại.
function phoneIdentity(phone: string): string {
  const digits = phone.replace(/^\+/, '');
  return /^0\d{9}$/.test(digits) ? `84${digits.slice(1)}` : digits;
}

export class MockUserStore {
  readonly user: TestUser;
  private readonly users = new Map<string, TestUser>();
  private readonly versions = new Map<string, number>();

  private constructor(config: MockAuthConfig, passwordHash: string) {
    this.user = this.add({
      user_name: 'Local test Farmer', phone_number: config.phoneNumber, gmail: null, gmail_verify: false,
      password: passwordHash, role: 'Farmer', status: 'Active', is_owner: false,
    });
  }

  static async create(config: MockAuthConfig): Promise<MockUserStore> {
    const store = new MockUserStore(config, await hashPassword(config.password));
    if (config.admin) {
      store.add({ user_name: 'Local test Admin', phone_number: config.admin.phoneNumber, password: await hashPassword(config.admin.password),
        gmail: null, gmail_verify: false, role: 'Admin', status: 'Active', is_owner: false });
    }
    return store;
  }

  // Giữ fixture cũ cho bộ test Auth; metadata version không phải field mới của ERD.
  get version(): number { return this.versionOf(this.user.id); }
  set version(value: number) { this.versions.set(this.user.id, value); }
  versionOf(id: string): number { return this.versions.get(id) ?? 0; }
  revokeTokens(id: string): void { this.versions.set(id, this.versionOf(id) + 1); }
  findById(id: string): TestUser | undefined { return this.users.get(id); }
  findByPhone(phone: string): TestUser | undefined { return [...this.users.values()].find((user) => user.phone_number === phone); }
  findByEmail(email: string): TestUser | undefined { return [...this.users.values()].find((user) => user.gmail === normalizeEmail(email)); }
  pendingManagers(): TestUser[] { return [...this.users.values()].filter((user) => user.role === 'Manager' && user.status === 'Pending'); }

  assertAvailable(phone: string, email?: string | null): void {
    if ([...this.users.values()].some((user) => phoneIdentity(user.phone_number) === phoneIdentity(phone))) {
      throw new ConflictException('Số điện thoại đã có tài khoản');
    }
    if (email && this.findByEmail(email)) { throw new ConflictException('Email đã có tài khoản'); }
    if (this.users.size >= 100) { throw new HttpException('Bộ nhớ test đã đầy; restart API để bắt đầu lại', HttpStatus.TOO_MANY_REQUESTS); }
  }

  add(input: Omit<TestUser, 'id' | 'created_at'>): TestUser {
    // Kiểm tra và ghi đồng bộ sau await hash, để hai request không cùng vượt qua UNIQUE.
    this.assertAvailable(input.phone_number, input.gmail);
    const user: TestUser = { ...input, gmail: input.gmail ? normalizeEmail(input.gmail) : null, id: randomUUID(), created_at: new Date().toISOString() };
    this.users.set(user.id, user);
    this.versions.set(user.id, 0);
    return user;
  }

  publicUser(user: TestUser = this.user): Omit<TestUser, 'password'> {
    // Whitelist tường minh để không trả hash hoặc metadata nội bộ khi thêm field.
    const { id, user_name, phone_number, gmail, gmail_verify, role, status, is_owner, created_at } = user;
    return { id, user_name, phone_number, gmail, gmail_verify, role, status, is_owner, created_at };
  }
}
