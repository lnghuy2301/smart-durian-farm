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
import { StandardsService } from '../src/standards/standards.service';

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
const standard = { code: 'DEMO', name: 'Tiêu chuẩn demo', description: '', certifying_body: 'Tổ chức demo' };

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

test('Standard Materials shares live catalogs, validates FK/pair uniqueness and scopes reads', async () => {
  const { app, request, login } = await setup();
  try {
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const farmer = await login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    const standardResponse = await request('standards', 'POST', standard, admin);
    const standardId = (await standardResponse.json() as { id: string }).id;
    const materialResponse = await request('materials', 'POST', material, admin);
    const materialId = (await materialResponse.json() as { id: string }).id;
    const otherStandard = app.get(StandardsService).create({ ...standard, code: 'OTHER' });
    app.get(MaterialsService).create({ ...material, name: 'Unlinked material' });
    const path = `standards/${standardId}/materials`;
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, 'POST', { material_id: materialId }, farmer)).status, 403);
    for (const invalid of [{ material_id: 'bad' }, { material_id: materialId, default_dosage: 'extra' }, {}]) {
      assert.equal((await request(path, 'POST', invalid, admin)).status, 400);
    }
    assert.equal((await request(path, 'POST', { material_id: randomUUID() }, admin)).status, 404);
    assert.equal((await request(`standards/${randomUUID()}/materials`, 'POST', { material_id: materialId }, admin)).status, 404);
    const competing = await Promise.all([
      request(path, 'POST', { material_id: materialId }, admin),
      request(path, 'POST', { material_id: materialId }, admin),
    ]);
    assert.deepEqual(competing.map((result) => result.status).sort(), [201, 409]);
    const list = await request(path, 'GET', undefined, farmer);
    const body = await list.json() as { standard_id: string; total: number; items: { id: string }[] };
    assert.equal(body.standard_id, standardId);
    assert.equal(body.total, 1);
    assert.equal(body.items[0].id, materialId);
    const otherList = await request(`standards/${otherStandard.id}/materials`, 'GET', undefined, farmer);
    assert.equal((await otherList.json() as { total: number }).total, 0);
    assert.equal((await request(`standards/${otherStandard.id}/materials`, 'POST', { material_id: materialId }, admin)).status, 201, 'N:N allows same material in another standard');
  } finally { await app.close(); }
});

test('Bridge filter/status keep stored relationships; deleting link preserves both catalogs', async () => {
  const { app, request, login } = await setup();
  try {
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const farmer = await login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    const standards = app.get(StandardsService);
    const materials = app.get(MaterialsService);
    const currentStandard = standards.create(standard);
    const first = materials.create(material);
    const second = materials.create({ ...material, name: 'Sinh học', material_type: 'Biological' });
    const path = `standards/${currentStandard.id}/materials`;
    assert.equal((await request(path, 'POST', { material_id: first.id }, admin)).status, 201);
    assert.equal((await request(path, 'POST', { material_id: second.id }, admin)).status, 201);
    materials.update(first.id, { status: 'Inactive', name: 'Đã sửa' });
    standards.update(currentStandard.id, { status: 'Inactive' });
    const filtered = await request(`${path}?status=Inactive&limit=1&offset=0`, 'GET', undefined, farmer);
    const body = await filtered.json() as { total: number; items: { name: string }[] };
    assert.equal(body.total, 1);
    assert.equal(body.items[0].name, 'Đã sửa');
    const all = await request(path, 'GET', undefined, farmer);
    assert.equal((await all.json() as { total: number }).total, 2);
    assert.equal((await request(`${path}?material_type=Biological`, 'GET', undefined, farmer)).status, 200);
    assert.equal((await request(`${path}?limit=101`, 'GET', undefined, farmer)).status, 400);
    assert.equal((await request(`${path}/${first.id}`, 'DELETE', undefined, farmer)).status, 403);
    const removed = await request(`${path}/${first.id}`, 'DELETE', undefined, admin);
    assert.equal(removed.status, 204);
    assert.equal(await removed.text(), '');
    assert.equal((await request(`${path}/${first.id}`, 'DELETE', undefined, admin)).status, 404);
    assert.equal(materials.get(first.id).status, 'Inactive');
    assert.equal(standards.get(currentStandard.id).status, 'Inactive');
    const remaining = await request(path, 'GET', undefined, farmer);
    assert.equal((await remaining.json() as { total: number }).total, 1);
  } finally { await app.close(); }
});

test('Standards Admin lifecycle preserves fields and status; Active Farmer can only read', async () => {
  const { app, request, login } = await setup();
  try {
    assert.equal((await request('standards')).status, 401);
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    const farmer = await login(env.AUTH_TEST_PHONE, env.AUTH_TEST_PASSWORD);
    assert.equal((await request('standards', 'POST', standard, farmer)).status, 403);
    const created = await request('standards', 'POST', standard, admin);
    assert.equal(created.status, 201);
    const record = await created.json() as { id: string; status: string; description: string };
    assert.equal(record.status, 'Active');
    assert.equal(record.description, '');
    assert.equal((await request(`standards/${record.id}`, 'GET', undefined, farmer)).status, 200);
    assert.equal((await request(`standards/${record.id}`, 'PATCH', { status: 'Inactive' }, farmer)).status, 403);
    assert.equal((await request(`standards/${record.id}`, 'PATCH', { status: 'Inactive' }, admin)).status, 200);
    assert.equal((await request(`standards/${record.id}`, 'PATCH', { description: 'Mô tả mới' }, admin)).status, 200);
    assert.equal(app.get(StandardsService).get(record.id).status, 'Inactive');
    for (const invalid of [{}, { status: null }, { code: null }, { farm_id: randomUUID() }]) {
      assert.equal((await request(`standards/${record.id}`, 'PATCH', invalid, admin)).status, 400);
    }
    assert.equal((await request(`standards/${record.id}`, 'DELETE', undefined, admin)).status, 404);
  } finally { await app.close(); }
});

test('Standards validate ERD fields and bounded description; search handles both code/name and pagination', async () => {
  const { app, request, login } = await setup();
  try {
    const admin = await login(env.AUTH_TEST_ADMIN_PHONE, env.AUTH_TEST_ADMIN_PASSWORD);
    for (const invalid of [{ code: ' ' }, { code: 'x'.repeat(41) }, { name: 'x'.repeat(101) }, { description: null },
      { description: 'x'.repeat(10001) }, { certifying_body: 'x'.repeat(121) }, { status: 'Removed' }, { zone_id: randomUUID() }]) {
      assert.equal((await request('standards', 'POST', { ...standard, ...invalid }, admin)).status, 400);
    }
    const service = app.get(StandardsService);
    const first = service.create({ ...standard, code: 'DEMO-1' });
    service.create({ ...standard, code: 'DEMO-2', status: 'Inactive' });
    service.create({ ...standard, code: 'OTHER', name: 'Khác' });
    const list = await request('standards?q=demo&limit=1&offset=1', 'GET', undefined, admin);
    const body = await list.json() as { total: number; items: { code: string }[] };
    assert.equal(body.total, 2);
    assert.equal(body.items[0].code, 'DEMO-2');
    const active = await request('standards?status=Active', 'GET', undefined, admin);
    assert.equal((await active.json() as { total: number }).total, 2);
    first.code = 'Changed outside store';
    const copy = service.get(first.id);
    copy.description = 'Changed copy';
    assert.equal(service.get(first.id).code, 'DEMO-1');
    assert.equal(service.get(first.id).description, '');
    for (const query of ['limit=0', 'offset=-1', 'status=bad', 'q[]=array', 'extra=1']) {
      assert.equal((await request(`standards?${query}`, 'GET', undefined, admin)).status, 400);
    }
    assert.equal((await request(`standards/${randomUUID()}`, 'GET', undefined, admin)).status, 404);
  } finally { await app.close(); }
});

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
