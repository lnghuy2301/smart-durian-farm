import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { MockUserStore } from '../src/auth/mock-user.store';
import { OtpProof, OtpProvider } from '../src/auth/sms/otp.provider';
import { AuthService } from '../src/auth/auth.service';
import { TwilioVerifyGateway } from '../src/auth/sms/twilio-verify.gateway';
import { EmailSender } from '../src/users/email/email.sender';
import { UsersService } from '../src/users/users.service';
import { MockCooperativeStore } from '../src/users/mock-cooperative.store';
import { FarmsService } from '../src/farms/farms.service';
import { CooperativesService } from '../src/cooperatives/cooperatives.service';
import { COOPERATIVE_OTP_PROVIDER, DisabledCooperativeOtpProvider } from '../src/cooperatives/cooperative-otp.provider';

const env = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000', AUTH_TEST_PASSWORD: 'LocalTestOnly123!',
  JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', AUTH_TEST_ADMIN_PHONE: '0900000001', AUTH_TEST_ADMIN_PASSWORD: 'LocalAdminOnly123!',
};
const input = { cooperative_name: 'HTX Demo', director: 'Director', certificate_number: 'COOP-001', address: 'Old address', contact_number: '0900000009' };
const page = { limit: 20, offset: 0 };
const DAY = 24 * 60 * 60 * 1000;
const wrong = (code: string) => code === '000000' ? '999999' : '000000';
const status = (value: number) => (error: unknown) => error instanceof HttpException && error.getStatus() === value;

async function fixture() {
  const config = readEnvironment(env);
  const mails: { to: string; code: string; purpose?: string }[] = [];
  const sender = { sendVerification: async (to: string, code: string, purpose?: string) => { mails.push({ to, code, purpose }); } };
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(EmailSender).useValue(sender).compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  await app.listen(0, '127.0.0.1');
  const users = app.get(MockUserStore);
  const admin = users.findByPhone(env.AUTH_TEST_ADMIN_PHONE)!;
  const farmer = users.user;
  const manager = users.add({ ...users.publicUser(), phone_number: '0900000003', gmail: 'manager@example.com', gmail_verify: true,
    role: 'Manager', status: 'Pending', password: farmer.password });
  const otherManager = users.add({ ...users.publicUser(), phone_number: '0900000004', gmail: 'other@example.com', gmail_verify: true,
    role: 'Manager', status: 'Pending', password: farmer.password });
  const service = app.get(CooperativesService);
  const store = app.get(MockCooperativeStore);
  const coop = service.create(admin.id, input);
  const attach = () => app.get(UsersService).approve(admin.id, manager.id, { cooperative_id: coop.id });
  const sms = app.get<OtpProvider>(COOPERATIVE_OTP_PROVIDER);
  const http = async (path: string, method = 'GET', body?: object, token?: string) => fetch(`${await app.getUrl()}/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (phone: string, password = env.AUTH_TEST_PASSWORD) => {
    const response = await http('auth/login', 'POST', { phone_number: phone, password });
    assert.equal(response.status, 200);
    return (await response.json() as { access_token: string }).access_token;
  };
  const emailStep = async (changes = { address: 'New address' }) => {
    const request = await service.createUpdateRequest(manager.id, coop.id, changes);
    service.verifyEmail(manager.id, request.id, mails.at(-1)!.code);
    return request;
  };
  const smsCode = (id: string) => service.testSms(manager.id, id).messages[0].otp;
  return { app, users, admin, farmer, manager, otherManager, service, store, coop, attach, mails, sender, sms, http, login, emailStep, smsCode };
}

test('Cooperatives share USERS/Farms store; Admin creates unmanaged HTX and existing approval attaches Manager', async () => {
  const f = await fixture();
  try {
    assert.equal(f.coop.manager_id, null);
    assert.equal(f.app.get(UsersService).listCooperatives(f.admin.id).cooperatives[0].id, f.coop.id);
    assert.equal(f.app.get(FarmsService).listCooperatives(f.farmer.id, page).items[0].id, f.coop.id);
    f.attach();
    assert.equal(f.store.get(f.coop.id).manager_id, f.manager.id);
    assert.equal(f.users.findById(f.manager.id)!.status, 'Active');
    assert.throws(() => f.app.get(UsersService).approve(f.admin.id, f.otherManager.id, { cooperative_id: f.coop.id }), status(409));
    assert.equal(f.users.findById(f.otherManager.id)!.status, 'Pending');
    assert.equal(f.service.get(f.manager.id, f.coop.id).lifecycle.deletion_due_at, null);
  } finally { await f.app.close(); }
});

test('HTX HTTP scopes reads, protects certificate/Manager fields, rejects null/unknown fields and isolates responses', async () => {
  const f = await fixture();
  try {
    f.attach();
    const admin = await f.login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const manager = await f.login(f.manager.phone_number);
    const farmer = await f.login(f.farmer.phone_number);
    const other = f.service.create(f.admin.id, { ...input, certificate_number: 'COOP-002' });
    assert.equal((await f.http('cooperatives')).status, 401);
    assert.equal((await f.http(`cooperatives/${other.id}`, 'GET', undefined, manager)).status, 404);
    const list = await f.http('cooperatives?q=Demo&limit=1', 'GET', undefined, manager);
    assert.equal((await list.json() as { total: number }).total, 1);
    assert.equal((await f.http(`cooperatives/${f.coop.id}`, 'GET', undefined, farmer)).status, 200);
    for (const jwt of [manager, farmer]) {
      assert.equal((await f.http('cooperatives', 'POST', input, jwt)).status, 403);
      assert.equal((await f.http(`cooperatives/${f.coop.id}`, 'PATCH', { address: 'Forbidden' }, jwt)).status, 403);
    }
    for (const body of [{}, { address: null }, { manager_id: f.manager.id }, { cooperative_name: ' ' }, { contact_number: 'abc' }]) {
      assert.equal((await f.http(`cooperatives/${f.coop.id}`, 'PATCH', body, admin)).status, 400);
    }
    assert.equal((await f.http(`cooperatives/${f.coop.id}/update-requests`, 'POST', { certificate_number: 'NO' }, manager)).status, 400);
    assert.equal((await f.http(`cooperatives/${f.coop.id}/update-requests`, 'POST', { address: 'No' }, farmer)).status, 403);
    assert.equal((await f.http('cooperative-notifications', 'GET', undefined, manager)).status, 403);
    assert.equal((await f.http('cooperative-update-requests', 'GET', undefined, farmer)).status, 403);
    assert.equal((await f.http('cooperatives?limit=101', 'GET', undefined, admin)).status, 400);
    assert.equal((await f.http('cooperatives/not-uuid', 'GET', undefined, admin)).status, 400);
    assert.equal((await f.http(`cooperatives/${f.coop.id}`, 'PATCH', { address: 'Updated' }, admin)).status, 200);
    assert.equal(f.store.get(f.coop.id).cooperative_name, input.cooperative_name);
    assert.equal(f.store.get(f.coop.id).certificate_number, input.certificate_number);
    assert.throws(() => f.service.update(f.admin.id, f.coop.id, { certificate_number: 'COOP-002' }), status(409));
    const copy = f.service.get(f.admin.id, f.coop.id);
    copy.address = 'Mutated response';
    assert.equal(f.store.get(f.coop.id).address, 'Updated');
  } finally { await f.app.close(); }
});

test('Manager updates require email then SMS to account contacts, commit only after both and cannot replay', async () => {
  const f = await fixture();
  try {
    f.attach();
    const manager = await f.login(f.manager.phone_number);
    const admin = await f.login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const response = await f.http(`cooperatives/${f.coop.id}/update-requests`, 'POST',
      { cooperative_name: 'New name', director: 'New director', address: 'New address', contact_number: '0900000008' }, manager);
    assert.equal(response.status, 201);
    const request = await response.json() as { id: string; status: string };
    assert.equal(request.status, 'EmailPending');
    assert.equal(f.mails[0].to, f.manager.gmail);
    assert.equal(f.mails[0].purpose, 'cooperative-update');
    assert.equal((await f.http(`cooperative-update-requests/${request.id}/sms/send`, 'POST', {}, manager)).status, 409);
    assert.equal((await f.http(`cooperative-update-requests/${request.id}/email/verify`, 'POST', { otp: f.mails[0].code }, admin)).status, 403);
    assert.equal((await f.http(`cooperative-update-requests/${request.id}/email/verify`, 'POST', { otp: f.mails[0].code }, manager)).status, 201);
    assert.equal(f.store.get(f.coop.id).address, input.address);
    assert.equal((await f.http(`cooperative-update-requests/${request.id}/sms/send`, 'POST', {}, manager)).status, 201);
    const code = f.smsCode(request.id);
    assert.equal(f.service.testSms(f.manager.id, request.id).messages[0].phone_number, f.manager.phone_number);
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, wrong(code)), status(400));
    assert.equal(f.store.get(f.coop.id).address, input.address);
    const result = await f.http(`cooperative-update-requests/${request.id}/sms/verify`, 'POST', { otp: code }, manager);
    assert.equal(result.status, 201);
    assert.equal(f.store.get(f.coop.id).address, 'New address');
    assert.equal(f.store.get(f.coop.id).contact_number, '0900000008');
    assert.equal(f.store.get(f.coop.id).certificate_number, input.certificate_number);
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, code), status(409));
    assert.equal(f.service.getRequest(f.manager.id, request.id).status, 'Accepted');
    assert.equal(f.sms.messages(f.manager.phone_number).length, 0);
    const serialized = JSON.stringify(f.service.getRequest(f.admin.id, request.id));
    assert.equal(/emailDigest|emailSalt|smsProof|tokenVersion|cooperativeVersion/.test(serialized), false);
  } finally { await f.app.close(); }
});

test('Each verification step gets a fresh window; exact email/SMS deadlines and five wrong attempts reject changes', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const f = await fixture();
  try {
    f.attach();
    const request = await f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Late update' });
    now += 9 * 60000 + 59000;
    f.service.verifyEmail(f.manager.id, request.id, f.mails.at(-1)!.code);
    now += 9 * 60000 + 59000;
    await f.service.sendSms(f.manager.id, request.id);
    now += 4 * 60000 + 59000;
    await f.service.verifySms(f.manager.id, request.id, f.smsCode(request.id));
    assert.equal(f.store.get(f.coop.id).address, 'Late update');
    const expiredEmail = await f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Never committed' });
    now += 10 * 60000;
    assert.throws(() => f.service.verifyEmail(f.manager.id, expiredEmail.id, f.mails.at(-1)!.code), status(409));
    const expiredSms = await f.emailStep();
    await f.service.sendSms(f.manager.id, expiredSms.id);
    const code = f.smsCode(expiredSms.id);
    now += 5 * 60000;
    await assert.rejects(f.service.verifySms(f.manager.id, expiredSms.id, code), status(409));
    const attempts = await f.emailStep();
    await f.service.sendSms(f.manager.id, attempts.id);
    const bad = wrong(f.smsCode(attempts.id));
    for (let index = 0; index < 5; index++) { await assert.rejects(f.service.verifySms(f.manager.id, attempts.id, bad), status(400)); }
    assert.equal(f.service.getRequest(f.manager.id, attempts.id).status, 'Failed');
    assert.equal(f.store.get(f.coop.id).address, 'Late update');
  } finally { await f.app.close(); }
});

test('Email attempts, resend cooldown, cancellation and a single active request per Manager are enforced', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const f = await fixture();
  try {
    f.attach();
    const request = await f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Pending' });
    await assert.rejects(f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Second' }), status(409));
    await assert.rejects(f.service.resendEmail(f.manager.id, request.id), status(429));
    now += 60000;
    await f.service.resendEmail(f.manager.id, request.id);
    for (let index = 0; index < 5; index++) { assert.throws(() => f.service.verifyEmail(f.manager.id, request.id, wrong(f.mails.at(-1)!.code)), status(400)); }
    assert.equal(f.service.getRequest(f.manager.id, request.id).status, 'Failed');
    const next = await f.emailStep();
    await f.service.sendSms(f.manager.id, next.id);
    await assert.rejects(f.service.sendSms(f.manager.id, next.id), status(429));
    f.service.cancel(f.manager.id, next.id);
    assert.equal(f.service.getRequest(f.manager.id, next.id).status, 'Cancelled');
    await assert.rejects(f.service.verifySms(f.manager.id, next.id, '000000'), status(409));
    assert.equal(f.store.get(f.coop.id).address, input.address);
  } finally { await f.app.close(); }
});

test('Admin edits and account changes invalidate pending Manager proofs, including changes during provider await', async (context) => {
  const f = await fixture();
  try {
    f.attach();
    let request = await f.emailStep();
    await f.service.sendSms(f.manager.id, request.id);
    const code = f.smsCode(request.id);
    const verify = f.sms.verify.bind(f.sms);
    context.mock.method(f.sms, 'verify', async (proof: OtpProof, otp: string) => {
      const matches = await verify(proof, otp);
      f.service.update(f.admin.id, f.coop.id, { address: 'Admin wins' });
      return matches;
    });
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, code), status(409));
    assert.equal(f.store.get(f.coop.id).address, 'Admin wins');
    assert.equal(f.service.getRequest(f.manager.id, request.id).status, 'Failed');
    request = await f.emailStep();
    f.users.revokeTokens(f.manager.id);
    await assert.rejects(f.service.sendSms(f.manager.id, request.id), status(409));
    request = await f.emailStep();
    f.manager.gmail = 'changed@example.com';
    await assert.rejects(f.service.sendSms(f.manager.id, request.id), status(409));
    f.manager.gmail = 'manager@example.com';
    request = await f.emailStep();
    f.manager.status = 'Locked';
    await assert.rejects(f.service.sendSms(f.manager.id, request.id), status(403));
    assert.equal(f.store.get(f.coop.id).address, 'Admin wins');
  } finally { await f.app.close(); }
});

test('In-flight sending/checking cannot be cancelled, duplicated or committed twice', async (context) => {
  const f = await fixture();
  try {
    f.attach();
    let release!: () => void;
    const sending = new Promise<void>((resolve) => { release = resolve; });
    context.mock.method(f.sender, 'sendVerification', async (to: string, code: string) => { f.mails.push({ to, code }); await sending; });
    const promise = f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Once' });
    const pending = f.service.listRequests(f.manager.id, page).items[0];
    assert.equal(pending.status, 'EmailSending');
    assert.throws(() => f.service.verifyEmail(f.manager.id, pending.id, f.mails[0].code), status(409));
    assert.throws(() => f.service.cancel(f.manager.id, pending.id), status(409));
    await assert.rejects(f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Duplicate' }), status(409));
    release();
    const request = await promise;
    f.service.verifyEmail(f.manager.id, request.id, f.mails[0].code);
    await f.service.sendSms(f.manager.id, request.id);
    const code = f.smsCode(request.id);
    const verify = f.sms.verify.bind(f.sms);
    let releaseVerify!: () => void;
    const checking = new Promise<void>((resolve) => { releaseVerify = resolve; });
    context.mock.method(f.sms, 'verify', async (proof: OtpProof, otp: string) => { await checking; return verify(proof, otp); });
    const first = f.service.verifySms(f.manager.id, request.id, code);
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, code), status(409));
    releaseVerify();
    await first;
    assert.equal(f.store.get(f.coop.id).address, 'Once');
  } finally { await f.app.close(); }
});

test('Provider failures/uncertain checks never change HTX; live mode hides mock OTP and fails without HTX configuration', async (context) => {
  const f = await fixture();
  try {
    f.attach();
    context.mock.method(f.sender, 'sendVerification', async () => { throw new ServiceUnavailableException('Email unavailable'); });
    await assert.rejects(f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'No' }), status(503));
    assert.equal(f.service.listRequests(f.manager.id, page).items[0].status, 'Failed');
    context.mock.restoreAll();
    const request = await f.emailStep();
    await f.service.sendSms(f.manager.id, request.id);
    const code = f.smsCode(request.id);
    context.mock.method(f.sms, 'verify', async () => { throw new ServiceUnavailableException('Uncertain check'); });
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, code), status(503));
    await assert.rejects(f.service.verifySms(f.manager.id, request.id, code), status(409));
    assert.equal(f.store.get(f.coop.id).address, input.address);
    context.mock.restoreAll();
    const hidden = await f.emailStep();
    await f.service.sendSms(f.manager.id, hidden.id);
    context.mock.getter(f.sms, 'mode', () => 'twilio');
    assert.throws(() => f.service.testSms(f.manager.id, hidden.id), status(404));
    await assert.rejects(new DisabledCooperativeOtpProvider().issue(), status(503));
  } finally { await f.app.close(); }
});

test('HTX and password reset keep independent challenges and consuming one preserves the other', async () => {
  const f = await fixture();
  try {
    f.attach();
    const request = await f.emailStep();
    await f.service.sendSms(f.manager.id, request.id);
    const code = f.smsCode(request.id);
    const auth = f.app.get(AuthService);
    await assert.rejects(auth.resetPassword(f.manager.phone_number, code, 'NewPassword123!'), status(400));
    await auth.forgotPassword(f.manager.phone_number);
    assert.equal(auth.testSms(f.manager.phone_number).messages.length, 1);
    // Việc reset dùng provider khác nên không xóa hay thay challenge HTX.
    await f.service.verifySms(f.manager.id, request.id, code);
    assert.equal(f.store.get(f.coop.id).address, 'New address');
    assert.equal(auth.testSms(f.manager.phone_number).messages.length, 1);
  } finally { await f.app.close(); }
});

test('Day 7 warns once, day 30 deletes unmanaged/unreferenced HTX; assignment cancels future deletion', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const f = await fixture();
  try {
    now += 7 * DAY - 1;
    assert.equal(f.service.listNotifications(f.admin.id, page).total, 0);
    now++;
    f.service.sweep();
    f.service.sweep();
    assert.equal(f.service.listNotifications(f.admin.id, page).total, 1);
    const managed = f.service.create(f.admin.id, { ...input, certificate_number: 'MANAGED' });
    f.app.get(UsersService).approve(f.admin.id, f.manager.id, { cooperative_id: managed.id });
    now += 23 * DAY - 1;
    f.service.sweep();
    assert.equal(f.store.get(f.coop.id).manager_id, null);
    now++;
    f.service.sweep();
    assert.throws(() => f.store.get(f.coop.id), status(404));
    assert.equal(f.store.get(managed.id).manager_id, f.manager.id);
    const notices = f.service.listNotifications(f.admin.id, page).items;
    assert.deepEqual(notices.map((item) => item.type), ['ManagerMissing', 'CooperativeDeleted']);
    f.service.sweep();
    assert.equal(f.service.listNotifications(f.admin.id, page).total, 2);
    assert.equal(notices[1].cooperative_name, input.cooperative_name);
  } finally { await f.app.close(); }
});

test('Business references block automatic HTX deletion and warning is retained without repeats', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const f = await fixture();
  try {
    context.mock.method(f.app.get(FarmsService), 'hasCooperativeReferences', (id: string) => id === f.coop.id);
    now += 30 * DAY;
    f.service.sweep();
    assert.equal(f.store.get(f.coop.id).manager_id, null);
    assert.deepEqual(f.service.listNotifications(f.admin.id, page).items.map((item) => item.type), ['ManagerMissing', 'DeletionBlocked']);
    f.service.sweep();
    assert.equal(f.service.listNotifications(f.admin.id, page).total, 2);
    f.attach();
    now += 30 * DAY;
    f.service.sweep();
    assert.equal(f.store.get(f.coop.id).manager_id, f.manager.id);
  } finally { await f.app.close(); }
});

test('Expiry during SMS send blocks new requests until provider returns; late results cannot commit', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const f = await fixture();
  try {
    f.attach();
    const request = await f.emailStep();
    const issue = f.sms.issue.bind(f.sms);
    let release!: () => void;
    const sending = new Promise<void>((resolve) => { release = resolve; });
    context.mock.method(f.sms, 'issue', async (phone: string, expiresAt: number) => {
      await sending;
      return issue(phone, expiresAt);
    });
    const pending = f.service.sendSms(f.manager.id, request.id);
    now += 5 * 60000;
    f.service.sweep();
    assert.equal(f.service.getRequest(f.manager.id, request.id).status, 'Expired');
    await assert.rejects(f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'Concurrent' }), status(409));
    release();
    await assert.rejects(pending, status(409));
    assert.equal(f.sms.messages(f.manager.phone_number).length, 0);
    assert.equal(f.service.getRequest(f.manager.id, request.id).status, 'Expired');
    assert.equal(f.service.getRequest(f.manager.id, request.id).resolved_at, new Date(now).toISOString());
    assert.equal(f.store.get(f.coop.id).address, input.address);
    await f.service.createUpdateRequest(f.manager.id, f.coop.id, { address: 'New request' });
  } finally { await f.app.close(); }
});

test('Deletion reference checks retain real Farm join/reject/leave history and notifications', async () => {
  const f = await fixture();
  try {
    const farms = f.app.get(FarmsService);
    assert.equal(farms.hasCooperativeReferences(f.coop.id), false);
    f.attach();
    const proposal = farms.createRequest(f.farmer.id, { area_size: 1, address: 'Farm', certificate_number: 'FARM', longitude: 106, latitude: 10 });
    const farmId = farms.approve(f.admin.id, proposal.id).farm_id!;
    const firstJoin = farms.joinRequest(f.farmer.id, farmId, f.coop.id);
    farms.reject(f.admin.id, firstJoin.id);
    assert.equal(farms.hasCooperativeReferences(f.coop.id), true);
    const join = farms.joinRequest(f.farmer.id, farmId, f.coop.id);
    farms.approve(f.admin.id, join.id);
    farms.approve(f.manager.id, join.id);
    assert.equal(farms.get(f.farmer.id, farmId).cooperative_id, f.coop.id);
    const leave = farms.leaveRequest(f.farmer.id, farmId);
    farms.approve(f.admin.id, leave.id);
    assert.equal(farms.get(f.farmer.id, farmId).cooperative_id, null);
    assert.equal(farms.listNotifications(f.manager.id, page).total, 1);
    assert.equal(farms.hasCooperativeReferences(f.coop.id), true);
    assert.equal(farms.hasCooperativeReferences(randomUUID()), false);
  } finally { await f.app.close(); }
});

test('HTX SMS configuration uses a separate service/allowlist without broadening Farmer reset allowlist', async () => {
  const liveEnv = { ...env, SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'b'.repeat(32),
    TWILIO_VERIFY_SERVICE_SID: `VA${'c'.repeat(32)}`, SMS_ALLOWED_PHONE: env.AUTH_TEST_PHONE, LIVE_SMS_ENABLED: 'true' };
  assert.equal(readEnvironment(liveEnv).auth!.cooperativeSms, undefined);
  const additions = { TWILIO_HTX_VERIFY_SERVICE_SID: `VA${'d'.repeat(32)}`, HTX_SMS_ALLOWED_PHONES: '0900000003,+84900000004,0900000003' };
  const config = readEnvironment({ ...liveEnv, ...additions }).auth!;
  assert.ok(config.sms.provider === 'twilio');
  assert.equal(config.sms.allowedPhones, undefined);
  assert.equal(config.sms.allowedPhone, env.AUTH_TEST_PHONE);
  assert.equal(config.cooperativeSms!.serviceSid, additions.TWILIO_HTX_VERIFY_SERVICE_SID);
  assert.equal(config.cooperativeSms!.allowedPhone, '+84900000003');
  assert.deepEqual(config.cooperativeSms!.allowedPhones, ['+84900000004']);
  for (const invalid of [
    { TWILIO_HTX_VERIFY_SERVICE_SID: liveEnv.TWILIO_VERIFY_SERVICE_SID },
    { TWILIO_HTX_VERIFY_SERVICE_SID: '' }, { HTX_SMS_ALLOWED_PHONES: '' }, { HTX_SMS_ALLOWED_PHONES: '0900000003,' },
    { HTX_SMS_ALLOWED_PHONES: 'not-phone' }, { HTX_SMS_ALLOWED_PHONES: Array(21).fill('0900000003').join(',') },
  ]) { assert.throws(() => readEnvironment({ ...liveEnv, ...additions, ...invalid })); }
  let sent = 0;
  const gateway = new TwilioVerifyGateway(config.cooperativeSms!, async () => { sent++; throw new Error('No network'); });
  await assert.rejects(gateway.issue(env.AUTH_TEST_PHONE), status(503));
  assert.equal(sent, 0);
  const resetGateway = new TwilioVerifyGateway(config.sms, async () => { sent++; throw new Error('No network'); });
  await assert.rejects(resetGateway.issue('0900000003'), status(503));
  assert.equal(sent, 0);
});
