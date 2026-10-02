import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { AuthService } from '../src/auth/auth.service';
import { MockUserStore } from '../src/auth/mock-user.store';
import { EmailSender } from '../src/users/email/email.sender';
import { EmailVerificationService } from '../src/users/email/email-verification.service';
import { MockCooperativeStore } from '../src/users/mock-cooperative.store';
import { UsersService } from '../src/users/users.service';

const env = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000',
  AUTH_TEST_PASSWORD: 'LocalTestOnly123!', JWT_SECRET: 'test-only-secret-with-at-least-32-bytes',
  AUTH_TEST_ADMIN_PHONE: '0900000001', AUTH_TEST_ADMIN_PASSWORD: 'LocalAdminOnly123!',
};
const password = 'RegisterTestOnly123!';
const cooperative = {
  cooperative_name: 'HTX test', director: 'Director test', certificate_number: 'TEST-001',
  address: 'Test address', contact_number: '0900000001',
};

class CapturingEmailSender extends EmailSender {
  messages: { email: string; code: string }[] = [];
  fail = false;
  async sendVerification(email: string, code: string): Promise<void> {
    if (this.fail) { throw new Error('Simulated SMTP failure'); }
    this.messages.push({ email, code });
  }
}

async function setup() {
  const sender = new CapturingEmailSender();
  const config = readEnvironment(env);
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(EmailSender).useValue(sender).compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const request = (path: string, method = 'GET', body?: object, token?: string) => fetch(`${base}/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const proof = async (phone: string, email: string) => {
    const service = app.get(EmailVerificationService);
    const issued = await service.request(phone, email);
    const code = sender.messages.at(-1)!.code;
    return service.verify({ phone_number: phone, gmail: email, verification_id: issued.verification_id, otp: code }).email_verification_token;
  };
  return { app, sender, request, proof };
}

test('HTTP Farmer registration validates roles, uniqueness and fields; email is optional', async () => {
  const { app, request } = await setup();
  try {
    const farmer = { phone_number: '0900000002', user_name: ' Farmer ', password, role: 'Farmer' };
    for (const extra of [{ role: 'Admin' }, { gmail_verify: true }, { status: 'Active' }, { is_owner: true }, { gmail: null }, { gmail: 'invalid-email' }]) {
      assert.equal((await request('auth/register', 'POST', { ...farmer, ...extra })).status, 400);
    }
    const created = await request('auth/register', 'POST', farmer);
    assert.equal(created.status, 201);
    const { user } = await created.json() as { user: Record<string, unknown> };
    assert.equal(user.user_name, 'Farmer');
    assert.equal(user.status, 'Active');
    assert.equal(user.gmail, null);
    assert.equal(user.gmail_verify, false);
    assert.equal(user.password, undefined);
    assert.equal((await request('auth/register', 'POST', { ...farmer, phone_number: '+84900000002' })).status, 409);
    assert.equal((await request('auth/login', 'POST', { phone_number: farmer.phone_number, password })).status, 200);
  } finally { await app.close(); }
});

test('Manager real-email contract, Pending access, Admin approval with HTX and rejection', async () => {
  const { app, sender, request, proof } = await setup();
  try {
    const manager = { phone_number: '0900000002', user_name: 'Manager test', password, role: 'Manager', gmail: 'manager@outlook.com' };
    assert.equal((await request('auth/register', 'POST', manager)).status, 400);
    assert.equal((await request('auth/registration/email/request', 'POST', { phone_number: manager.phone_number, gmail: 'bad' })).status, 400);
    const issuedResponse = await request('auth/registration/email/request', 'POST', { phone_number: manager.phone_number, gmail: ' Manager@Outlook.com ' });
    assert.equal(issuedResponse.status, 202);
    const issued = await issuedResponse.json() as { verification_id: string; otp?: string };
    assert.equal(issued.otp, undefined);
    const otp = sender.messages[0].code;
    assert.match(otp, /^\d{6}$/);
    assert.equal(sender.messages[0].email, manager.gmail);
    const verifiedResponse = await request('auth/registration/email/verify', 'POST', { phone_number: manager.phone_number, gmail: manager.gmail, verification_id: issued.verification_id, otp });
    assert.equal(verifiedResponse.status, 200);
    const verified = await verifiedResponse.json() as { email_verification_token: string };
    const created = await request('auth/register', 'POST', { ...manager, ...verified });
    // Chỉ truyền token thuộc contract; không dùng message/expires_in từ response vào DTO đăng ký.
    assert.equal(created.status, 400);
    const registered = await request('auth/register', 'POST', { ...manager, email_verification_token: verified.email_verification_token });
    assert.equal(registered.status, 201);
    const { user } = await registered.json() as { user: { id: string; status: string; gmail_verify: boolean; password?: string } };
    assert.equal(user.status, 'Pending');
    assert.equal(user.gmail_verify, true);
    assert.equal(user.password, undefined);
    assert.equal((await request('auth/login', 'POST', { phone_number: manager.phone_number, password })).status, 403);
    assert.equal((await request('auth/forgot-password', 'POST', { phone_number: manager.phone_number })).status, 202);
    assert.equal(app.get(AuthService).testSms(manager.phone_number).messages.length, 0);
    assert.equal((await request('users/pending-managers')).status, 401);
    const farmerLogin = await request('auth/login', 'POST', { phone_number: env.AUTH_TEST_PHONE, password: env.AUTH_TEST_PASSWORD });
    const farmerToken = (await farmerLogin.json() as { access_token: string }).access_token;
    assert.equal((await request(`users/${user.id}/approve`, 'PATCH', { cooperative }, farmerToken)).status, 403);
    const adminLogin = await request('auth/login', 'POST', { phone_number: env.AUTH_TEST_ADMIN_PHONE, password: env.AUTH_TEST_ADMIN_PASSWORD });
    const adminToken = (await adminLogin.json() as { access_token: string }).access_token;
    const pending = await request('users/pending-managers', 'GET', undefined, adminToken);
    assert.equal(pending.status, 200);
    assert.equal((await pending.json() as { users: object[] }).users.length, 1);
    assert.equal((await request(`users/${user.id}/approve`, 'PATCH', {}, adminToken)).status, 400);
    assert.equal((await request(`users/${user.id}/approve`, 'PATCH', { cooperative: { ...cooperative, manager_id: user.id } }, adminToken)).status, 400);
    assert.equal((await request(`users/${user.id}/approve`, 'PATCH', { cooperative, cooperative_id: user.id }, adminToken)).status, 400);
    assert.equal(app.get(MockUserStore).findById(user.id)!.status, 'Pending');
    const competing = await Promise.all([
      request(`users/${user.id}/approve`, 'PATCH', { cooperative }, adminToken),
      request(`users/${user.id}/approve`, 'PATCH', { cooperative }, adminToken),
    ]);
    assert.deepEqual(competing.map((result) => result.status).sort(), [200, 409]);
    assert.equal(app.get(MockCooperativeStore).list().length, 1);
    assert.equal(app.get(MockCooperativeStore).list()[0].manager_id, user.id);
    const managerLogin = await request('auth/login', 'POST', { phone_number: manager.phone_number, password });
    assert.equal(managerLogin.status, 200);
    const managerToken = (await managerLogin.json() as { access_token: string }).access_token;
    assert.equal((await request('auth/me', 'GET', undefined, managerToken)).status, 200);
    assert.equal((await request('users/pending-managers', 'GET', undefined, managerToken)).status, 403);
    const other = await app.get(UsersService).register({ ...manager, role: 'Manager', phone_number: '0900000003', gmail: 'other@example.org',
      email_verification_token: await proof('0900000003', 'other@example.org') });
    assert.equal((await request(`users/${other.user.id}/reject`, 'PATCH', { status: 'Active' }, adminToken)).status, 400);
    assert.equal((await request(`users/${other.user.id}/reject`, 'PATCH', {}, adminToken)).status, 200);
    assert.equal((await request(`users/${other.user.id}/approve`, 'PATCH', { cooperative }, adminToken)).status, 409);
    assert.equal((await request('auth/login', 'POST', { phone_number: '0900000003', password })).status, 403);
  } finally { await app.close(); }
});

test('Email proofs bind phone/email, expire and are single use; concurrent email uniqueness is enforced', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const { app, sender, proof } = await setup();
  try {
    const service = app.get(EmailVerificationService);
    const users = app.get(UsersService);
    const phone = '0900000002';
    const email = 'test@example.org';
    const issued = await service.request(phone, email);
    const code = sender.messages.at(-1)!.code;
    await assert.rejects(service.request(phone, email));
    assert.throws(() => service.verify({ phone_number: '0900000003', gmail: email, verification_id: issued.verification_id, otp: code }));
    const wrong = code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.throws(() => service.verify({ phone_number: phone, gmail: email, verification_id: issued.verification_id, otp: wrong }));
    }
    assert.throws(() => service.verify({ phone_number: phone, gmail: email, verification_id: issued.verification_id, otp: code }));
    now += 60000;
    const token = await proof(phone, email);
    assert.throws(() => service.requireProof('0900000003', email, token));
    assert.throws(() => service.requireProof(phone, 'different@example.org', token));
    const input = { phone_number: phone, user_name: 'Manager', role: 'Manager' as const, gmail: email, password, email_verification_token: token };
    const competing = await Promise.allSettled([users.register(input), users.register(input)]);
    assert.equal(competing.filter((result) => result.status === 'fulfilled').length, 1);
    assert.throws(() => service.requireProof(phone, email, token));
    await assert.rejects(users.register({ phone_number: '0900000003', user_name: 'Duplicate', role: 'Farmer', gmail: 'TEST@EXAMPLE.ORG', password }));
    now += 60000;
    const expiring = await proof('0900000004', 'expiry@example.net');
    now += 10 * 60000;
    await assert.rejects(users.register({ ...input, phone_number: '0900000004', gmail: 'expiry@example.net', email_verification_token: expiring }));
  } finally { await app.close(); }
});

test('SMTP failure cannot grant proof; pending sends cannot be verified or sent twice', async () => {
  const { app, sender } = await setup();
  try {
    const service = app.get(EmailVerificationService);
    sender.fail = true;
    await assert.rejects(service.request('0900000002', 'failed@example.net'));
    assert.throws(() => service.requireProof('0900000002', 'failed@example.net', 'anything'));
    let release!: () => void;
    sender.sendVerification = async (email, code) => {
      sender.messages.push({ email, code });
      await new Promise<void>((resolve) => { release = resolve; });
    };
    const sending = service.request('0900000003', 'delayed@example.net');
    await assert.rejects(service.request('0900000003', 'delayed@example.net'));
    assert.throws(() => service.verify({ phone_number: '0900000003', gmail: 'delayed@example.net', verification_id: 'unknown', otp: sender.messages[0].code }));
    release();
    await sending;
    assert.equal(sender.messages.length, 1);
  } finally { await app.close(); }
});

test('Approval failures leave Manager Pending; existing HTX assignment cannot replace another Manager', async () => {
  const { app, proof } = await setup();
  try {
    const users = app.get(UsersService);
    const store = app.get(MockUserStore);
    const cooperatives = app.get(MockCooperativeStore);
    const admin = store.findByPhone(env.AUTH_TEST_ADMIN_PHONE)!;
    const createManager = async (phone: string, email: string) => (await users.register({ phone_number: phone, gmail: email,
      user_name: 'Manager', role: 'Manager', password, email_verification_token: await proof(phone, email) })).user;
    const first = await createManager('0900000002', 'first@example.net');
    const existing = cooperatives.create(cooperative, null);
    assert.throws(() => users.approve(admin.id, first.id, { cooperative_id: first.id }));
    assert.throws(() => users.approve(admin.id, first.id, { cooperative }));
    assert.equal(store.findById(first.id)!.status, 'Pending');
    assert.equal(existing.manager_id, null);
    users.approve(admin.id, first.id, { cooperative_id: existing.id });
    assert.equal(existing.manager_id, first.id);
    const second = await createManager('0900000003', 'second@example.net');
    assert.throws(() => users.approve(admin.id, second.id, { cooperative_id: existing.id }));
    assert.equal(store.findById(second.id)!.status, 'Pending');
    assert.equal(existing.manager_id, first.id);
    admin.status = 'Locked';
    assert.throws(() => users.reject(admin.id, second.id));
  } finally { await app.close(); }
});

test('Password reset revokes only that account; per-user OTP outboxes stay isolated', async () => {
  const { app } = await setup();
  try {
    await app.get(UsersService).register({ phone_number: '0900000002', user_name: 'Farmer two', password, role: 'Farmer' });
    const auth = app.get(AuthService);
    const first = await auth.login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    const second = await auth.login('0900000002', password);
    await auth.forgotPassword(env.AUTH_TEST_PHONE);
    await auth.forgotPassword('0900000002');
    const firstOtp = auth.testSms(env.AUTH_TEST_PHONE).messages[0].otp;
    const secondOtp = auth.testSms('0900000002').messages[0].otp;
    await auth.resetPassword(env.AUTH_TEST_PHONE, firstOtp, 'ChangedTestOnly123!');
    await assert.rejects(auth.authenticate(first.access_token));
    assert.equal((await auth.authenticate(second.access_token)).phone_number, '0900000002');
    assert.equal(auth.testSms('0900000002').messages[0].otp, secondOtp);
    await auth.resetPassword('0900000002', secondOtp, 'OtherChanged123!');
    await assert.rejects(auth.authenticate(second.access_token));
  } finally { await app.close(); }
});
