import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { createApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { MockUserStore } from '../src/auth/mock-user.store';
import { UsersService } from '../src/users/users.service';
import { MaterialsService } from '../src/materials/materials.service';

const env = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000',
  AUTH_TEST_PASSWORD: 'LocalTestOnly123!', JWT_SECRET: 'test-only-secret-with-at-least-32-bytes',
  AUTH_TEST_ADMIN_PHONE: '0900000001', AUTH_TEST_ADMIN_PASSWORD: 'LocalAdminOnly123!',
};
const material = {
  name: 'Vật tư demo', material_type: 'Fertilizer' as const, default_dosage: 'Thông tin mẫu',
  unit: 'kg', quarantine_days: 0,
};

async function setup() {
  const app = await createApplication(readEnvironment(env), false);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const request = (path: string, method = 'GET', body?: object, token?: string) => fetch(`${base}/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (phone: string, password: string) => {
    const response = await request('auth/login', 'POST', { phone_number: phone, password });
    assert.equal(response.status, 200);
    return (await response.json() as { access_token: string }).access_token;
  };
  return { app, request, login };
}

test('Materials uses shared Auth; Admin writes, Active users read, Pending/Locked cannot access', async () => {
  const { app, request, login } = await setup();
  try {
    assert.equal((await request('materials')).status, 401);
    const farmer = await login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    assert.equal((await request('materials', 'POST', material, farmer)).status, 403);
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const created = await request('materials', 'POST', material, admin);
    assert.equal(created.status, 201);
    const record = await created.json() as { id: string; status: string };
    assert.equal(record.status, 'Active');
    assert.equal((await request(`materials/${record.id}`, 'GET', undefined, farmer)).status, 200);
    assert.equal((await request(`materials/${record.id}`, 'PATCH', { status: 'Inactive' }, farmer)).status, 403);
    await app.get(UsersService).register({ phone_number: '0900000002', user_name: 'New Farmer', password: env.AUTH_TEST_PASSWORD, role: 'Farmer' });
    const newFarmer = await login('0900000002', env.AUTH_TEST_PASSWORD);
    assert.equal((await request('materials', 'GET', undefined, newFarmer)).status, 200, 'registered users must share the same Auth store');
    const store = app.get(MockUserStore);
    const manager = store.add({ user_name: 'Manager fixture', phone_number: '0900000003', password: store.user.password,
      role: 'Manager', status: 'Active', is_owner: false, gmail: 'manager@example.org', gmail_verify: true });
    const managerToken = await login(manager.phone_number, env.AUTH_TEST_PASSWORD);
    assert.equal((await request('materials', 'GET', undefined, managerToken)).status, 200);
    assert.equal((await request('materials', 'POST', material, managerToken)).status, 403);
    manager.status = 'Pending';
    const pendingToken = await app.get(JwtService).signAsync({ sub: manager.id, version: 0 });
    assert.equal((await request('materials', 'GET', undefined, pendingToken)).status, 401);
    store.findByPhone(env.AUTH_TEST_ADMIN_PHONE)!.status = 'Locked';
    assert.equal((await request('materials', 'POST', material, admin)).status, 401);
  } finally { await app.close(); }
});

test('Material DTOs enforce ERD lengths/enums/int and reject unknown fields, null and empty PATCH', async () => {
  const { app, request, login } = await setup();
  try {
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    for (const invalid of [{ name: ' ' }, { name: 'x'.repeat(256) }, { material_type: 'Stock' }, { default_dosage: 'x'.repeat(101) },
      { unit: 'x'.repeat(11) }, { quarantine_days: -1 }, { quarantine_days: 0.5 }, { quarantine_days: '1' },
      { quarantine_days: 2147483648 }, { status: null }, { status: 'Removed' }, { id: randomUUID() }, { stock: 10 }]) {
      assert.equal((await request('materials', 'POST', { ...material, ...invalid }, admin)).status, 400);
    }
    const created = await request('materials', 'POST', { ...material, name: ' Vật tư demo ' }, admin);
    const record = await created.json() as { id: string; name: string };
    assert.equal(record.name, material.name);
    for (const invalid of [{}, { unit: null }, { quarantine_days: null }, { name: '' }, { unknown: true }]) {
      assert.equal((await request(`materials/${record.id}`, 'PATCH', invalid, admin)).status, 400);
    }
    const changed = await request(`materials/${record.id}`, 'PATCH', { name: 'Đã sửa' }, admin);
    assert.equal(changed.status, 200);
    assert.equal((await changed.json() as { status: string }).status, 'Active', 'partial update must not reset omitted fields');
    assert.equal((await request(`materials/${record.id}`, 'PATCH', { status: 'Inactive' }, admin)).status, 200);
    assert.equal((await request(`materials/${record.id}`, 'PATCH', { name: 'Sửa lần hai' }, admin)).status, 200);
    assert.equal(app.get(MaterialsService).get(record.id).status, 'Inactive');
    assert.equal((await request(`materials/${record.id}`, 'DELETE', undefined, admin)).status, 404);
    assert.equal((await request('materials/not-a-uuid', 'GET', undefined, admin)).status, 400);
    assert.equal((await request(`materials/${randomUUID()}`, 'GET', undefined, admin)).status, 404);
  } finally { await app.close(); }
});

test('Material search/filter/pagination are bounded and do not expose mutable store records', async () => {
  const { app, request, login } = await setup();
  try {
    const farmer = await login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    const service = app.get(MaterialsService);
    const first = service.create({ ...material, name: 'Vật tư Một' });
    service.create({ ...material, name: 'Vật tư Hai', status: 'Inactive' });
    service.create({ ...material, name: 'Sinh học', material_type: 'Biological' });
    first.name = 'Changed outside store';
    assert.equal(service.get(first.id).name, 'Vật tư Một');
    const copy = service.get(first.id);
    copy.unit = 'wrong';
    assert.equal(service.get(first.id).unit, 'kg');
    const response = await request(`materials?q=${encodeURIComponent('VẬT TƯ')}&material_type=Fertilizer&limit=1&offset=1`, 'GET', undefined, farmer);
    const list = await response.json() as { items: { name: string }[]; total: number; limit: number; offset: number };
    assert.equal(list.total, 2);
    assert.equal(list.items[0].name, 'Vật tư Hai');
    assert.equal(list.limit, 1);
    assert.equal(list.offset, 1);
    const active = await request('materials?status=Active', 'GET', undefined, farmer);
    assert.equal((await active.json() as { total: number }).total, 2);
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'limit=abc', 'status=Dead', 'material_type=Unknown', 'stock=1']) {
      assert.equal((await request(`materials?${query}`, 'GET', undefined, farmer)).status, 400);
    }
  } finally { await app.close(); }
});
