import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { TreesService } from '../src/trees/trees.service';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { TreeHarvestsService, HARVEST_REQUEST_LIMIT } from '../src/tree-harvests/tree-harvests.service';
import { HarvestRequest, TestTreeHarvest } from '../src/tree-harvests/tree-harvests.types';
import { validateHarvestDate, vietnamToday } from '../src/tree-harvests/harvest-date-policy';

const page = { limit: 20, offset: 0 };
const dayBefore = (days: number) => new Date(Date.parse(vietnamToday() + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);

async function fixture() {
  const f = await zoneFixture();
  const trees = f.app.get(TreesService);
  const harvests = f.app.get(TreeHarvestsService);
  const assignments = f.app.get(AssignmentsService);
  const zone = f.zones.create(f.owner.id, f.input);
  const treeInput = { zone_id: zone.id, variety: 'Ri6', plant_date: '2024-05-01T00:00:00Z', longitude: 106, latitude: 10 };
  const tree = trees.create(f.owner.id, treeInput);
  const input = { tree_id: tree.id, season_name: 'Vu demo', harvest_date: vietnamToday(), fruit_count: 10, total_weight_kg: 30.5, batch_code: 'BATCH-A' };
  const assign = () => assignments.approve(f.worker.id, assignments.createRequest(f.owner.id, zone.id, { user_id: f.worker.id }).id).assignment_id!;
  return { ...f, trees, harvests, assignments, zone, tree, treeInput, input, assign };
}

test('Harvest HTTP validates ERD fields, nested corrections and forbids backend-managed fields', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http('tree-harvests')).status, 401);
    for (const patch of [{ tree_id: null }, { tree_id: 'bad' }, { season_name: ' ' }, { season_name: 'a'.repeat(51) },
      { batch_code: ' ' }, { batch_code: 'a'.repeat(51) }, { harvest_date: '2026-02-30' }, { harvest_date: '2026-10-05T00:00:00Z' },
      { harvest_date: null }, { fruit_count: '10' }, { fruit_count: 1.1 }, { fruit_count: 0 }, { fruit_count: 2147483648 },
      { total_weight_kg: '30' }, { total_weight_kg: 0 }, { total_weight_kg: 100000 }, { total_weight_kg: 1.001 },
      { status: 'Confirmed' }, { created_by: f.admin.id }, { updated_at: '2026-10-05T00:00:00Z' }, { id: randomUUID() }]) {
      assert.equal((await f.http('tree-harvests', 'POST', { ...f.input, ...patch }, token)).status, 400, JSON.stringify(patch));
    }
    const response = await f.http('tree-harvests', 'POST', { ...f.input, season_name: ' Vu demo ', batch_code: ' BATCH-A ' }, token);
    assert.equal(response.status, 201);
    const record = await response.json() as TestTreeHarvest;
    assert.equal(record.batch_code, 'BATCH-A');
    assert.equal(record.season_name, 'Vu demo');
    assert.equal(record.created_by, f.owner.id);
    assert.equal(record.status, 'Draft');
    assert.equal(record.updated_at, null);
    for (const patch of [{}, { fruit_count: 10 }, { tree_id: randomUUID() }, { created_by: f.worker.id }, { status: 'Confirmed' }, { fruit_count: null }]) {
      assert.equal((await f.http(`tree-harvests/${record.id}`, 'PATCH', patch, token)).status, 400);
    }
    assert.equal((await f.http(`tree-harvests/${record.id}/submit`, 'PATCH', { status: 'Confirmed' }, token)).status, 400);
    assert.equal((await f.http(`tree-harvests/${record.id}/submit`, 'PATCH', {}, token)).status, 200);
    for (const changes of [null, [], {}, { status: 'Draft' }, { fruit_count: '2' }, { total_weight_kg: null }]) {
      assert.equal((await f.http(`tree-harvests/${record.id}/correction-requests`, 'POST', { reason: 'Sai', changes }, token)).status, 400, JSON.stringify(changes));
    }
    assert.equal((await f.http('tree-harvests?limit=101', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('tree-harvests?status=Draff', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('tree-harvests?zone_id=bad', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('tree-harvests?created_by=' + f.owner.id, 'GET', undefined, token)).status, 400);
    assert.equal((await f.http('harvest-requests?status=bad', 'GET', undefined, token)).status, 400);
  } finally { await f.app.close(); }
});

test('Harvest tree/day conflicts serialize owner and worker; batch shares Zone/date and locks individual records', async () => {
  const f = await fixture();
  try {
    f.assign();
    const owner = await f.login(f.owner.phone_number);
    const worker = await f.login(f.worker.phone_number);
    const results = await Promise.all([f.http('tree-harvests', 'POST', f.input, owner), f.http('tree-harvests', 'POST', f.input, worker)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const record = f.harvests.list(f.owner.id, page).items[0];
    f.harvests.updateDraft(f.owner.id, record.id, { fruit_count: 20, total_weight_kg: 61 });
    assert.equal(f.harvests.get(f.owner.id, record.id).fruit_count, 20);
    assert.throws(() => f.harvests.create(f.owner.id, { ...f.input, batch_code: 'OTHER' }), /Cây đã có/);
    const submitted = f.harvests.submit(record.created_by, record.id);
    if (submitted.status === 'Pending') { f.harvests.approve(f.owner.id, f.harvests.listRequests(f.owner.id, page).items[0].id); }
    const second = f.trees.create(f.owner.id, f.treeInput);
    const added = f.harvests.create(f.owner.id, { ...f.input, tree_id: second.id });
    assert.equal(added.status, 'Draft', 'Confirmed sibling does not lock entire batch');
    assert.equal(f.harvests.list(f.owner.id, { ...page, q: 'batch-a' }).total, 2);
    assert.throws(() => f.harvests.create(f.owner.id, { ...f.input, harvest_date: dayBefore(1) }), /Mã batch/);
    const another = f.harvests.create(f.owner.id, { ...f.input, harvest_date: dayBefore(1), batch_code: 'BATCH-B' });
    assert.notEqual(another.id, record.id);
    const zoneB = f.zones.create(f.owner.id, { farm_id: f.farm.id, standard_id: f.standard.id, zone_name: 'B', area_size: 0.3, longitude: 106, latitude: 10 });
    const treeB = f.trees.create(f.owner.id, { ...f.treeInput, zone_id: zoneB.id });
    assert.throws(() => f.harvests.create(f.owner.id, { ...f.input, tree_id: treeB.id }), /Mã batch/);
    assert.equal(f.harvests.list(f.owner.id, { ...page, zone_id: f.zone.id, limit: 1, offset: 1 }).total, 3);
    assert.throws(() => f.harvests.updateDraft(f.owner.id, record.id, { fruit_count: 21 }), /Draft/);
    assert.throws(() => f.harvests.removeDraft(f.owner.id, record.id), /Không xóa/);
  } finally { await f.app.close(); }
});

test('Owner saves Draft, auto-confirms only on submit and never sets update fields on initial confirmation', async () => {
  const f = await fixture();
  try {
    const record = f.harvests.create(f.owner.id, f.input);
    f.harvests.updateDraft(f.owner.id, record.id, { fruit_count: 11 });
    const confirmed = f.harvests.submit(f.owner.id, record.id);
    assert.equal(confirmed.status, 'Confirmed');
    assert.equal(confirmed.updated_by, null);
    assert.equal(confirmed.updated_at, null);
    assert.equal(confirmed.created_at, record.created_at);
    assert.equal(f.harvests.listRequests(f.owner.id, page).total, 0);
    assert.throws(() => f.harvests.submit(f.owner.id, record.id), /Draft/);
  } finally { await f.app.close(); }
});

test('Worker submits then owner approves once; rejection restores editable Draft and scope is enforced', async () => {
  const f = await fixture();
  try {
    const invitation = f.assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id });
    assert.throws(() => f.harvests.create(f.worker.id, f.input), /đang phụ trách/);
    f.assignments.approve(f.worker.id, invitation.id);
    const record = f.harvests.create(f.worker.id, f.input);
    const owner = await f.login(f.owner.phone_number);
    const worker = await f.login(f.worker.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    assert.equal((await f.http(`tree-harvests/${record.id}/submit`, 'PATCH', {}, owner)).status, 403);
    assert.equal((await f.http(`tree-harvests/${record.id}/submit`, 'PATCH', {}, worker)).status, 200);
    const request = f.harvests.listRequests(f.owner.id, { ...page, status: 'Pending' }).items[0];
    assert.equal(request.action, 'Confirm');
    assert.equal((await f.http(`harvest-requests/${request.id}/approve`, 'PATCH', {}, admin)).status, 403);
    f.harvests.reject(f.owner.id, request.id, 'Kiểm tra số trái');
    assert.equal(f.harvests.get(f.owner.id, record.id).status, 'Draft');
    f.harvests.updateDraft(f.worker.id, record.id, { fruit_count: 12 });
    f.harvests.submit(f.worker.id, record.id);
    const next = f.harvests.listRequests(f.owner.id, { ...page, status: 'Pending' }).items[0];
    const results = await Promise.all([f.http(`harvest-requests/${next.id}/approve`, 'PATCH', {}, owner), f.http(`harvest-requests/${next.id}/approve`, 'PATCH', {}, owner)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const confirmed = f.harvests.get(f.worker.id, record.id);
    assert.equal(confirmed.updated_at, null);
    assert.equal(confirmed.updated_by, null);
    assert.equal(confirmed.created_by, f.worker.id);
    assert.equal((await f.http(`tree-harvests/${record.id}`, 'DELETE', undefined, worker)).status, 409);
    assert.equal((await f.http('tree-harvests', 'POST', { ...f.input, harvest_date: dayBefore(1), batch_code: 'B' }, admin)).status, 403);
  } finally { await f.app.close(); }
});

test('Confirmed corrections keep old data while Pending; Admin approves independent Farm and records actual editor', async () => {
  const f = await fixture();
  try {
    const record = f.harvests.create(f.owner.id, f.input);
    f.harvests.submit(f.owner.id, record.id);
    const token = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const response = await f.http(`tree-harvests/${record.id}/correction-requests`, 'POST', { reason: 'Cân lại', changes: { total_weight_kg: 31 } }, token);
    assert.equal(response.status, 201);
    const request = await response.json() as HarvestRequest;
    assert.equal(f.harvests.get(f.owner.id, record.id).total_weight_kg, 30.5);
    assert.equal(f.harvests.get(f.owner.id, record.id).status, 'Pending');
    assert.equal(f.harvests.get(f.owner.id, record.id).updated_by, null);
    assert.equal((await f.http(`tree-harvests/${record.id}`, 'DELETE', undefined, token)).status, 409);
    assert.equal((await f.http(`harvest-requests/${request.id}/approve`, 'PATCH', {}, token)).status, 403);
    assert.equal((await f.http(`harvest-requests/${request.id}/approve`, 'PATCH', {}, admin)).status, 200);
    const corrected = f.harvests.get(f.owner.id, record.id);
    assert.equal(corrected.total_weight_kg, 31);
    assert.equal(corrected.status, 'Confirmed');
    assert.equal(corrected.updated_by, f.owner.id);
    assert.ok(corrected.updated_at);
    assert.equal(corrected.created_at, record.created_at);
    const second = f.harvests.correction(f.owner.id, record.id, { reason: 'Sai lần nữa', changes: { fruit_count: 20 } });
    f.harvests.reject(f.admin.id, second.id);
    assert.deepEqual(f.harvests.get(f.owner.id, record.id), corrected);
    assert.throws(() => f.harvests.approve(f.admin.id, second.id), /đã được xử lý/);
  } finally { await f.app.close(); }
});

test('Own Harvest history survives assignment end; former author requests but owner supplies the correction', async () => {
  const f = await fixture();
  try {
    const assignmentId = f.assign();
    const record = f.harvests.create(f.worker.id, f.input);
    f.harvests.submit(f.worker.id, record.id);
    f.harvests.approve(f.owner.id, f.harvests.listRequests(f.owner.id, page).items[0].id);
    f.assignments.end(f.owner.id, assignmentId);
    assert.throws(() => f.trees.get(f.worker.id, f.tree.id), /phạm vi/);
    assert.equal(f.harvests.get(f.worker.id, record.id).id, record.id);
    assert.equal(f.harvests.list(f.worker.id, page).total, 1);
    const otherTree = f.trees.create(f.owner.id, f.treeInput);
    const otherHarvest = f.harvests.create(f.owner.id, { ...f.input, tree_id: otherTree.id });
    assert.throws(() => f.harvests.get(f.worker.id, otherHarvest.id), /phạm vi/);
    assert.equal(f.harvests.list(f.worker.id, page).total, 1, 'Ended worker sees only own author history');
    assert.throws(() => f.harvests.correction(f.worker.id, record.id, { reason: 'Sai', changes: { fruit_count: 11 } }), /hết phân công/);
    const request = f.harvests.correction(f.worker.id, record.id, { reason: 'Nhờ chủ sửa số trái' });
    assert.equal(request.editor_id, null);
    assert.throws(() => f.harvests.approve(f.admin.id, request.id), /bổ sung/);
    assert.throws(() => f.harvests.prepareCorrection(f.worker.id, request.id, { fruit_count: 11 }), /đang phụ trách/);
    const prepared = f.harvests.prepareCorrection(f.owner.id, request.id, { fruit_count: 11 });
    assert.equal(prepared.editor_id, f.owner.id);
    f.harvests.approve(f.admin.id, request.id);
    assert.equal(f.harvests.get(f.worker.id, record.id).updated_by, f.owner.id);
    assert.equal(f.harvests.get(f.worker.id, record.id).created_by, f.worker.id);
    const next = f.harvests.correction(f.owner.id, record.id, { reason: 'Cân lại', changes: { total_weight_kg: 32 } });
    assert.equal(f.harvests.getRequest(f.worker.id, next.id).requested_by, f.owner.id);
  } finally { await f.app.close(); }
});

test('Manager reviews only current HTX corrections; membership changes invalidate Pending context', async () => {
  const f = await fixture();
  try {
    f.assign();
    const record = f.harvests.create(f.worker.id, f.input);
    f.harvests.submit(f.worker.id, record.id);
    f.harvests.approve(f.owner.id, f.harvests.listRequests(f.owner.id, page).items[0].id);
    assert.equal(f.harvests.list(f.manager.id, page).total, 0);
    f.join();
    assert.equal(f.harvests.get(f.manager.id, record.id).id, record.id);
    const request = f.harvests.correction(f.worker.id, record.id, { reason: 'Sai', changes: { fruit_count: 11 } });
    assert.throws(() => f.harvests.approve(f.admin.id, request.id), /Manager/);
    f.worker.status = 'Locked';
    assert.throws(() => f.harvests.approve(f.manager.id, request.id), /Active/);
    f.worker.status = 'Active';
    f.harvests.approve(f.manager.id, request.id);
    assert.equal(f.harvests.get(f.owner.id, record.id).updated_by, f.worker.id);
    const stale = f.harvests.correction(f.worker.id, record.id, { reason: 'Sai', changes: { fruit_count: 12 } });
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.throws(() => f.harvests.approve(f.manager.id, stale.id), /Admin/);
    assert.throws(() => f.harvests.approve(f.admin.id, stale.id), /HTX đã thay đổi/);
    assert.equal(f.harvests.list(f.manager.id, page).total, 0);
    f.harvests.reject(f.owner.id, stale.id);
    const fresh = f.harvests.correction(f.worker.id, record.id, { reason: 'Gửi lại', changes: { fruit_count: 12 } });
    f.harvests.approve(f.admin.id, fresh.id);
    assert.equal(f.harvests.get(f.owner.id, record.id).fruit_count, 12);
  } finally { await f.app.close(); }
});

test('Vietnam harvest calendar counts days rather than 168 hours, handles leap dates and exact boundary', () => {
  const before = Date.parse('2026-10-04T16:59:59.999Z');
  const after = Date.parse('2026-10-04T17:00:00.000Z');
  assert.equal(vietnamToday(before), '2026-10-04');
  assert.equal(vietnamToday(after), '2026-10-05');
  assert.equal(validateHarvestDate('2026-09-27', before), 7);
  assert.equal(validateHarvestDate('2026-09-27', after), 8);
  assert.throws(() => validateHarvestDate('2026-10-05', before), /tương lai/);
  assert.equal(validateHarvestDate('2024-02-29', Date.parse('2024-03-01T00:00:00Z')), 1);
  for (const date of ['2025-02-29', '2026-04-31', '0000-01-01', 'bad', '2026-10-04T00:00:00Z']) {
    assert.throws(() => validateHarvestDate(date, before), /hợp lệ/);
  }
});

test('Admin backdate permission binds user, Zone and date, expires exactly and never grants assignment rights', async (context) => {
  const f = await fixture();
  try {
    f.assign();
    const input = { ...f.input, harvest_date: dayBefore(8) };
    assert.throws(() => f.harvests.create(f.worker.id, input), /quá 7 ngày/);
    const permissionInput = { user_id: f.worker.id, zone_id: f.zone.id, harvest_date: input.harvest_date,
      expires_at: new Date(Date.now() + 3600000).toISOString(), reason: 'Nhập bù' };
    assert.throws(() => f.harvests.grantBackdate(f.owner.id, permissionInput), /Chỉ Admin/);
    const permission = f.harvests.grantBackdate(f.admin.id, permissionInput);
    const zoneB = f.zones.create(f.owner.id, { farm_id: f.farm.id, standard_id: f.standard.id, zone_name: 'B', area_size: 0.3, longitude: 106, latitude: 10 });
    f.assignments.approve(f.worker.id, f.assignments.createRequest(f.owner.id, zoneB.id, { user_id: f.worker.id }).id);
    const treeB = f.trees.create(f.owner.id, { ...f.treeInput, zone_id: zoneB.id });
    assert.throws(() => f.harvests.create(f.worker.id, { ...input, tree_id: treeB.id, batch_code: 'OTHER-ZONE' }), /quá 7 ngày/);
    assert.throws(() => f.harvests.create(f.owner.id, input), /quá 7 ngày/);
    assert.throws(() => f.harvests.create(f.worker.id, { ...input, harvest_date: dayBefore(9) }), /quá 7 ngày/);
    const created = f.harvests.create(f.worker.id, input);
    assert.equal(created.harvest_date, input.harvest_date);
    assert.equal(created.created_at.slice(0, 10).length, 10);
    const secondTree = f.trees.create(f.owner.id, f.treeInput);
    f.harvests.create(f.worker.id, { ...input, tree_id: secondTree.id });
    const thirdTree = f.trees.create(f.owner.id, f.treeInput);
    const clock = context.mock.method(Date, 'now', () => Date.parse(permission.expires_at));
    assert.throws(() => f.harvests.create(f.worker.id, { ...input, tree_id: thirdTree.id }), /quá 7 ngày/);
    clock.mock.restore();
    f.admin.status = 'Locked';
    assert.throws(() => f.harvests.create(f.worker.id, { ...input, tree_id: thirdTree.id }), /quá 7 ngày/);
    f.admin.status = 'Active';
    f.harvests.revokeBackdate(f.admin.id, permission.id);
    assert.throws(() => f.harvests.create(f.worker.id, { ...input, tree_id: thirdTree.id }), /quá 7 ngày/);
    const current = f.assignments.list(f.worker.id, page, true).items[0].assignment;
    f.assignments.end(f.owner.id, current.id);
    assert.throws(() => f.harvests.grantBackdate(f.admin.id, permissionInput), /đang phụ trách/);
    assert.equal(f.harvests.listBackdates(f.worker.id, page).total, 1);
    assert.equal(f.harvests.listBackdates(f.manager.id, page).total, 0);
    const boundary = f.harvests.create(f.owner.id, { ...f.input, harvest_date: dayBefore(7), batch_code: 'SEVEN' });
    assert.ok(boundary.id);
    const adminToken = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const ownerToken = await f.login(f.owner.phone_number);
    const ownerPermission = { ...permissionInput, user_id: f.owner.id };
    assert.equal((await f.http('harvest-backdate-permissions', 'POST', ownerPermission, ownerToken)).status, 403);
    for (const invalid of [{ user_id: null }, { zone_id: 'bad' }, { expires_at: null }, { expires_at: '2000-01-01T00:00:00Z' },
      { expires_at: '2027-10-05T10:00:00' }, { reason: ' ' }, { granted_by: f.admin.id }]) {
      assert.equal((await f.http('harvest-backdate-permissions', 'POST', { ...ownerPermission, ...invalid }, adminToken)).status, 400);
    }
    assert.equal((await f.http('harvest-backdate-permissions', 'POST', ownerPermission, adminToken)).status, 201);
  } finally { await f.app.close(); }
});

test('Dead/Removed permits older harvest date but rejects today; copies cannot mutate data or proposals', async () => {
  const f = await fixture();
  try {
    f.trees.update(f.owner.id, f.tree.id, { status: 'Dead' });
    assert.throws(() => f.harvests.create(f.owner.id, f.input), /ngày cũ/);
    const record = f.harvests.create(f.owner.id, { ...f.input, harvest_date: dayBefore(1) });
    record.fruit_count = 999;
    assert.equal(f.harvests.get(f.owner.id, record.id).fruit_count, 10);
    f.harvests.submit(f.owner.id, record.id);
    const request = f.harvests.correction(f.owner.id, record.id, { reason: 'Sai', changes: { fruit_count: 11 } });
    request.proposed_changes!.fruit_count = 999;
    request.harvest_snapshot.fruit_count = 999;
    f.harvests.approve(f.admin.id, request.id);
    assert.equal(f.harvests.get(f.owner.id, record.id).fruit_count, 11);
    assert.equal(f.harvests.getRequest(f.owner.id, request.id).harvest_snapshot.fruit_count, 10);
    const copy = f.harvests.list(f.owner.id, page);
    copy.items[0].status = 'Draft';
    assert.equal(f.harvests.get(f.owner.id, record.id).status, 'Confirmed');
    f.trees.update(f.owner.id, f.tree.id, { status: 'Removed' });
    assert.throws(() => f.harvests.create(f.owner.id, f.input), /ngày cũ/);
  } finally { await f.app.close(); }
});

test('Approval rechecks conflicts against new records, preserves Pending data and allows safe rejection', async () => {
  const f = await fixture();
  try {
    const record = f.harvests.create(f.owner.id, f.input);
    f.harvests.submit(f.owner.id, record.id);
    const proposed = f.harvests.correction(f.owner.id, record.id, { reason: 'Sai ngày', changes: { harvest_date: dayBefore(1), batch_code: 'OTHER' } });
    f.harvests.create(f.owner.id, { ...f.input, harvest_date: dayBefore(1), batch_code: 'OTHER' });
    assert.throws(() => f.harvests.approve(f.admin.id, proposed.id), /Cây đã có/);
    const pending = f.harvests.get(f.owner.id, record.id);
    assert.equal(pending.harvest_date, f.input.harvest_date);
    assert.equal(pending.updated_at, null);
    assert.equal(pending.status, 'Pending');
    assert.equal(f.harvests.getRequest(f.owner.id, proposed.id).status, 'Pending');
    f.harvests.reject(f.admin.id, proposed.id);
    assert.equal(f.harvests.get(f.owner.id, record.id).status, 'Confirmed');
  } finally { await f.app.close(); }
});

test('Request capacity refuses correction without leaving a phantom Pending record', async () => {
  const f = await fixture();
  try {
    const record = f.harvests.create(f.owner.id, f.input);
    f.harvests.submit(f.owner.id, record.id);
    for (let i = 0; i < HARVEST_REQUEST_LIMIT; i++) {
      const request = f.harvests.correction(f.owner.id, record.id, { reason: 'Sửa cân', changes: { total_weight_kg: i + 100 } });
      f.harvests.approve(f.admin.id, request.id);
    }
    const before = f.harvests.get(f.owner.id, record.id);
    assert.throws(() => f.harvests.correction(f.owner.id, record.id, { reason: 'Đầy', changes: { fruit_count: 12 } }), /đã đầy/);
    assert.deepEqual(f.harvests.get(f.owner.id, record.id), before);
    assert.equal(f.harvests.listRequests(f.owner.id, { ...page, status: 'Pending' }).total, 0);
  } finally { await f.app.close(); }
});
