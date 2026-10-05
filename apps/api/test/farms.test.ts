import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { MockUserStore } from '../src/auth/mock-user.store';
import { FarmsService } from '../src/farms/farms.service';
import { FarmChangeRequest, TestFarm } from '../src/farms/farms.types';
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
const details = { area_size: 1.25, address: 'Địa chỉ demo', certificate_number: 'FARM-DEMO', longitude: 106.1234567, latitude: 10.7654321 };
const coopInput = { cooperative_name: 'HTX demo', director: 'Đại diện demo', certificate_number: 'COOP-DEMO', address: 'Địa chỉ HTX', contact_number: '0900000001' };

class FakeEmailSender extends EmailSender {
  code = '';
  async sendVerification(_email: string, code: string) { this.code = code; }
}

async function setup() {
  const config = readEnvironment(env);
  const email = new FakeEmailSender();
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(EmailSender).useValue(email).compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const request = (path: string, method = 'GET', body?: object, token?: string) => fetch(`${base}/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (phone: string, password = env.AUTH_TEST_PASSWORD) => {
    const response = await request('auth/login', 'POST', { phone_number: phone, password });
    assert.equal(response.status, 200);
    return (await response.json() as { access_token: string }).access_token;
  };
  const users = app.get(MockUserStore);
  const farmer = users.user;
  const admin = users.findByPhone(env.AUTH_TEST_ADMIN_PHONE)!;
  const otherFarmer = users.add({ ...users.publicUser(), phone_number: '0900000002', password: farmer.password });
  const manager = users.add({ ...users.publicUser(), role: 'Manager', phone_number: '0900000003', password: farmer.password });
  const otherManager = users.add({ ...users.publicUser(), role: 'Manager', phone_number: '0900000004', password: farmer.password });
  const cooperatives = app.get(MockCooperativeStore);
  const coop = cooperatives.create(coopInput, manager.id);
  const otherCoop = cooperatives.create({ ...coopInput, certificate_number: 'COOP-OTHER' }, otherManager.id);
  const farms = app.get(FarmsService);
  const acceptedFarm = () => {
    const proposed = farms.createRequest(farmer.id, details);
    const accepted = farms.approve(admin.id, proposed.id);
    return farms.get(farmer.id, accepted.farm_id!);
  };
  return { app, request, login, email, users, farms, farmer, admin, otherFarmer, manager, otherManager, cooperatives, coop, otherCoop, acceptedFarm };
}

test('Farm create is a proposal until opposite party accepts; is_owner changes only on acceptance', async () => {
  const { app, request, login, farms, farmer, admin, otherFarmer, manager } = await setup();
  try {
    assert.equal((await request('farms')).status, 401);
    const farmerToken = await login(farmer.phone_number);
    const adminToken = await login(admin.phone_number, env.AUTH_TEST_ADMIN_PASSWORD);
    const managerToken = await login(manager.phone_number);
    assert.equal((await request('farms/requests', 'POST', details, managerToken)).status, 403);
    const response = await request('farms/requests', 'POST', details, farmerToken);
    assert.equal(response.status, 201);
    const proposed = await response.json() as FarmChangeRequest;
    assert.equal(proposed.status, 'Pending');
    assert.equal(proposed.farm_id, null);
    assert.equal(farmer.is_owner, false);
    assert.equal(farms.list(admin.id, { limit: 20, offset: 0 }).total, 0);
    assert.equal((await request(`farm-requests/${proposed.id}/approve`, 'PATCH', { status: 'Accepted' }, adminToken)).status, 400);
    assert.equal((await request(`farm-requests/${proposed.id}/approve`, 'PATCH', {}, farmerToken)).status, 403);
    const approvals = await Promise.all([
      request(`farm-requests/${proposed.id}/approve`, 'PATCH', {}, adminToken),
      request(`farm-requests/${proposed.id}/approve`, 'PATCH', {}, adminToken),
    ]);
    assert.deepEqual(approvals.map((item) => item.status).sort(), [200, 409]);
    assert.equal(farmer.is_owner, true);
    const accepted = farms.getRequest(admin.id, proposed.id);
    const farm = farms.get(farmer.id, accepted.farm_id!);
    assert.equal(farm.cooperative_id, null);
    assert.equal(farm.join_cooperative_date, null);
    assert.equal(farms.list(admin.id, { limit: 20, offset: 0 }).total, 1);
    const byAdmin = farms.createRequest(admin.id, { ...details, owner_id: otherFarmer.id });
    assert.throws(() => farms.approve(admin.id, byAdmin.id), /Không được tự duyệt/);
    assert.throws(() => farms.approve(farmer.id, byAdmin.id), /không thuộc bên/);
    farms.approve(otherFarmer.id, byAdmin.id);
    assert.equal(otherFarmer.is_owner, true);
  } finally { await app.close(); }
});

test('Farm update/reject preserves official data and one pending change; ownership cannot be bypassed', async () => {
  const { app, request, login, farms, farmer, admin, otherFarmer, manager, acceptedFarm } = await setup();
  try {
    const farm = acceptedFarm();
    const ownerToken = await login(farmer.phone_number);
    const otherToken = await login(otherFarmer.phone_number);
    const managerToken = await login(manager.phone_number);
    assert.equal((await request(`farms/${farm.id}`, 'GET', undefined, otherToken)).status, 404);
    assert.equal((await request(`farms/${farm.id}/update-requests`, 'POST', { address: 'Sửa' }, otherToken)).status, 403);
    assert.equal((await request(`farms/${farm.id}/update-requests`, 'POST', { address: 'Sửa' }, managerToken)).status, 403);
    for (const invalid of [{}, { owner_id: otherFarmer.id }, { cooperative_id: randomUUID() }, { join_cooperative_date: new Date().toISOString() }, { address: null }]) {
      assert.equal((await request(`farms/${farm.id}/update-requests`, 'POST', invalid, ownerToken)).status, 400);
    }
    assert.throws(() => farms.updateRequest(farmer.id, farm.id, { address: details.address }), /không khác/);
    const proposed = farms.updateRequest(farmer.id, farm.id, { address: 'Địa chỉ mới' });
    assert.equal(farms.get(farmer.id, farm.id).address, details.address);
    assert.throws(() => farms.updateRequest(admin.id, farm.id, { area_size: 2 }), /đã có yêu cầu/);
    farms.reject(admin.id, proposed.id, 'Cần bổ sung');
    assert.equal(farms.get(farmer.id, farm.id).address, details.address);
    assert.throws(() => farms.approve(admin.id, proposed.id), /đã được xử lý/);
    const second = farms.updateRequest(admin.id, farm.id, { address: 'Đã xác nhận' });
    farms.approve(farmer.id, second.id);
    assert.equal(farms.get(farmer.id, farm.id).address, 'Đã xác nhận');
    assert.equal(farms.get(farmer.id, farm.id).area_size, farm.area_size);
    assert.equal((await request(`farms/${farm.id}`, 'PATCH', { address: 'Bypass' }, ownerToken)).status, 404);
  } finally { await app.close(); }
});

test('Join requires both Admin and the correct Manager; concurrent approvals accept exactly once', async () => {
  const { app, request, login, farms, farmer, admin, manager, otherManager, coop, acceptedFarm } = await setup();
  try {
    const farm = acceptedFarm();
    const farmerToken = await login(farmer.phone_number);
    const adminToken = await login(admin.phone_number, env.AUTH_TEST_ADMIN_PASSWORD);
    const managerToken = await login(manager.phone_number);
    const otherToken = await login(otherManager.phone_number);
    const proposalResponse = await request(`farms/${farm.id}/join-requests`, 'POST', { cooperative_id: coop.id }, farmerToken);
    assert.equal(proposalResponse.status, 201);
    const proposal = await proposalResponse.json() as FarmChangeRequest;
    assert.deepEqual(proposal.required_approvals.map((item) => item.role), ['Admin', 'Manager']);
    assert.equal(proposal.farm_snapshot?.address, details.address);
    assert.equal((await request(`farms/${farm.id}`, 'GET', undefined, managerToken)).status, 404);
    assert.equal((await request(`farm-requests/${proposal.id}`, 'GET', undefined, managerToken)).status, 200);
    assert.equal((await request(`farm-requests/${proposal.id}`, 'GET', undefined, otherToken)).status, 404);
    assert.equal((await request(`farm-requests/${proposal.id}/approve`, 'PATCH', {}, otherToken)).status, 403);
    const approvals = await Promise.all([
      request(`farm-requests/${proposal.id}/approve`, 'PATCH', {}, adminToken),
      request(`farm-requests/${proposal.id}/approve`, 'PATCH', {}, managerToken),
    ]);
    assert.deepEqual(approvals.map((item) => item.status), [200, 200]);
    const statuses = await Promise.all(approvals.map(async (item) => (await item.json() as FarmChangeRequest).status));
    assert.deepEqual(statuses.sort(), ['Accepted', 'Pending']);
    const joined = farms.get(farmer.id, farm.id);
    assert.equal(joined.cooperative_id, coop.id);
    assert.ok(joined.join_cooperative_date);
    assert.equal((await request(`farms/${farm.id}`, 'GET', undefined, managerToken)).status, 200);
    assert.throws(() => farms.joinRequest(farmer.id, farm.id, coop.id), /phải rời/);
  } finally { await app.close(); }
});

test('Admin-initiated joining needs owner and Manager; rejection keeps membership unchanged', async () => {
  const { app, farms, farmer, admin, manager, cooperatives, coop, acceptedFarm } = await setup();
  try {
    const farm = acceptedFarm();
    const noManager = cooperatives.create({ ...coopInput, certificate_number: 'NO-MANAGER' }, null);
    assert.throws(() => farms.joinRequest(farmer.id, farm.id, noManager.id), /Manager Active/);
    assert.throws(() => farms.joinRequest(farmer.id, farm.id, randomUUID()), /Không tìm thấy HTX/);
    const proposal = farms.joinRequest(admin.id, farm.id, coop.id);
    assert.deepEqual(proposal.required_approvals.map((item) => item.role), ['Farmer', 'Manager']);
    assert.throws(() => farms.approve(admin.id, proposal.id), /Không được tự duyệt/);
    assert.equal(farms.approve(farmer.id, proposal.id).status, 'Pending');
    assert.equal(farms.get(farmer.id, farm.id).cooperative_id, null);
    farms.reject(manager.id, proposal.id, 'Chưa phù hợp');
    assert.equal(farms.get(farmer.id, farm.id).cooperative_id, null);
    const next = farms.joinRequest(admin.id, farm.id, coop.id);
    assert.equal(farms.approve(manager.id, next.id).status, 'Pending');
    assert.equal(farms.approve(farmer.id, next.id).status, 'Accepted');
  } finally { await app.close(); }
});

test('Leave needs only opposite party approval, not Manager approval, and notifies the correct Manager once', async () => {
  const { app, request, login, farms, farmer, admin, manager, otherManager, coop, acceptedFarm } = await setup();
  try {
    const farm = acceptedFarm();
    const join = farms.joinRequest(farmer.id, farm.id, coop.id);
    farms.approve(admin.id, join.id);
    farms.approve(manager.id, join.id);
    const managerToken = await login(manager.phone_number);
    const farmerToken = await login(farmer.phone_number);
    assert.equal((await request(`farms/${farm.id}/leave-requests`, 'POST', { cooperative_id: null }, farmerToken)).status, 400);
    const leave = farms.leaveRequest(admin.id, farm.id);
    assert.deepEqual(leave.required_approvals.map((item) => item.role), ['Farmer']);
    assert.equal(farms.listNotifications(manager.id, { limit: 20, offset: 0 }).total, 0);
    assert.equal((await request(`farm-requests/${leave.id}/approve`, 'PATCH', {}, managerToken)).status, 403);
    manager.status = 'Locked'; // Rời không cần Manager Active; thông báo còn đó khi Manager quay lại.
    assert.equal(farms.approve(farmer.id, leave.id).status, 'Accepted');
    manager.status = 'Active';
    const left = farms.get(farmer.id, farm.id);
    assert.equal(left.cooperative_id, null);
    assert.equal(left.join_cooperative_date, null);
    assert.equal(farmer.is_owner, true);
    assert.equal((await request(`farms/${farm.id}`, 'GET', undefined, managerToken)).status, 404);
    assert.throws(() => farms.approve(farmer.id, leave.id), /đã được xử lý/);
    const notices = await request('farm-notifications', 'GET', undefined, managerToken);
    const body = await notices.json() as { total: number; items: { farm_id: string; request_id: string }[] };
    assert.equal(body.total, 1);
    assert.equal(body.items[0].farm_id, farm.id);
    assert.equal(body.items[0].request_id, leave.id);
    assert.equal(farms.listNotifications(otherManager.id, { limit: 20, offset: 0 }).total, 0);
    assert.throws(() => farms.leaveRequest(farmer.id, farm.id), /chưa thuộc HTX/);
    assert.throws(() => farms.listNotifications(farmer.id, { limit: 20, offset: 0 }), /dành cho Manager/);
  } finally { await app.close(); }
});

test('Pending approvals recheck user states and never commit partial Farm or approval on failure', async () => {
  const { app, farms, farmer, admin, manager, coop, acceptedFarm } = await setup();
  try {
    const farm = acceptedFarm();
    const join = farms.joinRequest(farmer.id, farm.id, coop.id);
    farms.approve(manager.id, join.id);
    manager.status = 'Locked';
    assert.throws(() => farms.approve(admin.id, join.id), /Manager của HTX/);
    assert.equal(farms.get(farmer.id, farm.id).cooperative_id, null);
    assert.equal(farms.getRequest(admin.id, join.id).required_approvals[0].approved_by, null);
    manager.status = 'Active';
    farmer.status = 'Pending';
    assert.throws(() => farms.approve(admin.id, join.id), /Farmer Active/);
    farmer.status = 'Active';
    assert.equal(farms.approve(admin.id, join.id).status, 'Accepted');
    const update = farms.updateRequest(admin.id, farm.id, { area_size: 3 });
    admin.status = 'Locked';
    assert.throws(() => farms.approve(farmer.id, update.id), /Tài khoản đề xuất/);
    admin.status = 'Active';
    assert.equal(farms.get(farmer.id, farm.id).area_size, details.area_size);
    farms.approve(farmer.id, update.id);
    const secondJoin = farms.leaveRequest(farmer.id, farm.id);
    farms.approve(admin.id, secondJoin.id);
    const rejoin = farms.joinRequest(farmer.id, farm.id, coop.id);
    farms.approve(admin.id, rejoin.id);
    admin.status = 'Locked';
    assert.throws(() => farms.approve(manager.id, rejoin.id), /Người đã duyệt/);
    admin.status = 'Active';
    assert.equal(farms.get(farmer.id, farm.id).cooperative_id, null);
    assert.equal(farms.approve(manager.id, rejoin.id).status, 'Accepted');
  } finally { await app.close(); }
});

test('Farm DTOs enforce decimal/geographic limits and scoped bounded reads return isolated copies', async () => {
  const { app, request, login, farms, farmer, admin, manager, otherFarmer, coop, acceptedFarm } = await setup();
  try {
    const token = await login(farmer.phone_number);
    for (const invalid of [{ area_size: 0 }, { area_size: 10000 }, { area_size: 1.2345 }, { area_size: '1' },
      { address: ' ' }, { address: 'x'.repeat(256) }, { certificate_number: 'x'.repeat(19) }, { longitude: 181 },
      { latitude: -91 }, { longitude: 106.12345678 }, { latitude: null }, { owner_id: null }, { cooperative_id: coop.id },
      { status: 'Active' }, { is_owner: true }]) {
      const response = await request('farms/requests', 'POST', { ...details, ...invalid }, token);
      assert.equal(response.status, 400, JSON.stringify(invalid));
    }
    assert.equal((await request('farms/requests', 'POST', { ...details, owner_id: otherFarmer.id }, token)).status, 403);
    const adminToken = await login(admin.phone_number, env.AUTH_TEST_ADMIN_PASSWORD);
    assert.equal((await request('farms/requests', 'POST', details, adminToken)).status, 400);
    assert.equal((await request('farms/requests', 'POST', { ...details, owner_id: manager.id }, adminToken)).status, 409);
    const farm = acceptedFarm();
    farms.approve(admin.id, farms.createRequest(otherFarmer.id, { ...details, address: 'Khác' }).id);
    const own = await request('farms?q=demo&limit=1&offset=0', 'GET', undefined, token);
    assert.equal((await own.json() as { total: number }).total, 1);
    assert.equal(farms.list(otherFarmer.id, { limit: 20, offset: 0 }).total, 1);
    assert.equal(farms.list(admin.id, { limit: 20, offset: 0 }).total, 2);
    assert.equal(farms.list(manager.id, { limit: 20, offset: 0 }).total, 0);
    for (const query of ['limit=101', 'offset=-1', 'q[]=array', 'owner_id=extra', 'limit=bad']) {
      assert.equal((await request(`farms?${query}`, 'GET', undefined, token)).status, 400);
    }
    assert.equal((await request('farm-requests?status=bad', 'GET', undefined, token)).status, 400);
    const proposal = farms.updateRequest(farmer.id, farm.id, { address: 'Mới' });
    proposal.proposed_changes.address = 'Bị sửa ngoài';
    proposal.required_approvals[0].approved_by = farmer.id;
    farms.approve(admin.id, proposal.id);
    assert.equal(farms.get(farmer.id, farm.id).address, 'Mới');
    const copy = farms.get(farmer.id, farm.id);
    copy.owner_id = otherFarmer.id;
    assert.equal(farms.get(farmer.id, farm.id).owner_id, farmer.id);
    const requestCopy = farms.getRequest(admin.id, proposal.id);
    requestCopy.farm_snapshot!.address = 'Sửa snapshot';
    assert.equal(farms.getRequest(admin.id, proposal.id).farm_snapshot!.address, details.address);
  } finally { await app.close(); }
});

test('Farms shares USERS registration/approval stores and enforces one Manager per Cooperative', async () => {
  const { app, request, login, farms, farmer, admin, manager, email, cooperatives, coop, acceptedFarm } = await setup();
  try {
    const unassigned = cooperatives.create({ ...coopInput, certificate_number: 'UNASSIGNED' }, null);
    assert.throws(() => cooperatives.assign(unassigned.id, manager.id), /đã quản lý/);
    assert.equal(cooperatives.get(unassigned.id).manager_id, null);
    assert.throws(() => cooperatives.create({ ...coopInput, certificate_number: 'SECOND' }, manager.id), /đã quản lý/);
    coop.manager_id = null;
    assert.equal(cooperatives.get(coop.id).manager_id, manager.id, 'returned copies cannot bypass uniqueness');
    const verification = app.get(EmailVerificationService);
    const usersService = app.get(UsersService);
    const phone = '0900000005';
    const gmail = 'manager@example.org';
    const issued = await verification.request(phone, gmail);
    const proof = verification.verify({ phone_number: phone, gmail, verification_id: issued.verification_id, otp: email.code });
    const registered = await usersService.register({ phone_number: phone, password: env.AUTH_TEST_PASSWORD, user_name: 'New Manager',
      role: 'Manager', gmail, email_verification_token: proof.email_verification_token });
    const approval = usersService.approve(admin.id, registered.user.id, { cooperative_id: unassigned.id });
    assert.equal(approval.cooperative.id, unassigned.id);
    const managerToken = await login(phone);
    const coopList = await request('cooperatives', 'GET', undefined, managerToken);
    const body = await coopList.json() as { total: number; items: { id: string }[] };
    assert.equal(body.total, 1);
    assert.equal(body.items[0].id, unassigned.id);
    const farm = acceptedFarm();
    const join = farms.joinRequest(farmer.id, farm.id, unassigned.id);
    farms.approve(admin.id, join.id);
    assert.equal((await request(`farm-requests/${join.id}/approve`, 'PATCH', {}, managerToken)).status, 200);
    const listed = await request('farms', 'GET', undefined, managerToken);
    const joined = await listed.json() as { total: number; items: TestFarm[] };
    assert.equal(joined.total, 1);
    assert.equal(joined.items[0].id, farm.id);
    app.get(MockUserStore).findById(registered.user.id)!.status = 'Pending';
    assert.equal((await request('farms', 'GET', undefined, managerToken)).status, 401);
  } finally { await app.close(); }
});
