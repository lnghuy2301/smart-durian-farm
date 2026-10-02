import { randomUUID } from 'node:crypto';
import { MockAuthConfig } from '../config/environment';
import { hashPassword } from './password';

export interface TestUser {
  id: string;
  user_name: string;
  phone_number: string;
  password: string;
  role: 'Farmer';
  status: 'Active' | 'Locked';
  is_owner: boolean;
  created_at: string;
}

export class MockUserStore {
  version = 0;
  readonly user: TestUser;
  private constructor(config: MockAuthConfig, passwordHash: string) {
    this.user = {
      id: randomUUID(), user_name: 'Local test Farmer', phone_number: config.phoneNumber,
      password: passwordHash, role: 'Farmer', status: 'Active', is_owner: false,
      created_at: new Date().toISOString(),
    };
  }
  static async create(config: MockAuthConfig): Promise<MockUserStore> {
    return new MockUserStore(config, await hashPassword(config.password));
  }
  publicUser(): Omit<TestUser, 'password'> {
    // Whitelist tường minh để không vô tình trả password/hash khi thêm field vào store.
    const { id, user_name, phone_number, role, status, is_owner, created_at } = this.user;
    return { id, user_name, phone_number, role, status, is_owner, created_at };
  }
}
