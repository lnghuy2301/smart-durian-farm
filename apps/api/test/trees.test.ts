import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { TreesService, TREE_HISTORY_LIMIT } from '../src/trees/trees.service';
import { TestTree } from '../src/trees/trees.types';

const page = { limit: 20, offset: 0 };
const details = { variety: 'Ri6', plant_date: '2024-05-01T08:00:00+07:00', longitude: 106, latitude: 10 };

async function fixture() {
  const f = await zoneFixture();
  const trees = f.app.get(TreesService);
  const zone = f.zones.create(f.owner.id, f.input);
  return { ...f, trees, zone, treeInput: { zone_id: zone.id, ...details } };
}

test('Trees HTTP contract validates fields, immutable backend codes and safe PATCH defaults', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http('trees')).status, 401);
    for (const invalid of [{ variety: ' ' }, { variety: 'a'.repeat(81) }, { plant_date: '2024-02-30T00:00:00Z' },
      { plant_date: '2024-05-01' }, { plant_date: '2024-05-01T08:00:00' }, { plant_date: null }, { longitude: '106' },
      { longitude: 181 }, { latitude: -91 }, { latitude: 1.12345678 }, { zone_id: null }, { zone_id: 'bad' },
      { status: null }, { status: 'Inactive' }, { tree_code: 'CLIENT' }, { id: randomUUID() }]) {
      assert.equal((await f.http('trees', 'POST', { ...f.treeInput, ...invalid }, token)).status, 400, JSON.stringify(invalid));
    }
    const response = await f.http('trees', 'POST', { ...f.treeInput, variety: ' Ri6 ' }, token);
    assert.equal(response.status, 201);
    const tree = await response.json() as TestTree;
    assert.equal(tree.variety, 'Ri6');
    assert.equal(tree.status, 'Active');
    assert.equal(tree.plant_date, '2024-05-01T01:00:00.000Z');
    assert.equal(tree.tree_code, `DRN-${tree.id}`);
    assert.notEqual(f.trees.create(f.owner.id, f.treeInput).tree_code, tree.tree_code);
    for (const patch of [{}, { variety: 'Ri6' }, { zone_id: randomUUID() }, { tree_code: 'CLIENT' }, { id: randomUUID() },
      { status: null }, { variety: null }, { plant_date: null }, { longitude: null }]) {
      assert.equal((await f.http(`trees/${tree.id}`, 'PATCH', patch, token)).status, 400, JSON.stringify(patch));
    }
    assert.equal((await f.http(`trees/${tree.id}`, 'PATCH', { status: 'Dead' }, token)).status, 200);
    assert.equal((await f.http(`trees/${tree.id}`, 'PATCH', { variety: 'Monthong' }, token)).status, 200);
    const current = f.trees.get(f.owner.id, tree.id);
    assert.equal(current.status, 'Dead', 'PATCH without status cannot silently restore a tree');
    assert.equal(current.tree_code, tree.tree_code);
    assert.equal(current.zone_id, f.zone.id);
    assert.equal((await f.http(`trees/by-code/${tree.tree_code}`, 'GET', undefined, token)).status, 200);
    assert.equal((await f.http('trees/by-code/bad', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http(`trees/${tree.id}`, 'DELETE', undefined, token)).status, 404);
    assert.equal((await f.http('trees', 'POST', { ...f.treeInput, zone_id: randomUUID() }, token)).status, 404);
  } finally { await f.app.close(); }
});

test('Only the owner writes Trees; Admin proposes and outsiders cannot read current metadata', async () => {
  const f = await fixture();
  try {
    const tree = f.trees.create(f.owner.id, f.treeInput);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const worker = await f.login(f.worker.phone_number);
    const manager = await f.login(f.manager.phone_number);
    for (const token of [admin, worker, manager]) {
      assert.equal((await f.http('trees', 'POST', f.treeInput, token)).status, 403);
      assert.equal((await f.http(`trees/${tree.id}`, 'PATCH', { status: 'Removed' }, token)).status, 403);
    }
    for (const token of [worker, manager]) {
      assert.equal((await f.http(`trees/${tree.id}`, 'GET', undefined, token)).status, 404);
      assert.equal((await f.http(`trees/by-code/${tree.tree_code}`, 'GET', undefined, token)).status, 404);
      assert.equal((await f.http(`trees/${tree.id}/history`, 'GET', undefined, token)).status, 404);
      assert.equal((await f.http('trees/requests', 'POST', f.treeInput, token)).status, 403);
    }
    assert.equal((await f.http(`trees/${tree.id}`, 'GET', undefined, admin)).status, 200);
    assert.throws(() => f.trees.update(f.worker.id, tree.id, { status: 'Dead' }), /Chỉ chủ Farm/);
    f.owner.status = 'Locked';
    assert.throws(() => f.trees.createRequest(f.admin.id, f.treeInput), /Active/);
    assert.throws(() => f.trees.get(f.owner.id, tree.id), /Active/);
  } finally { await f.app.close(); }
});

test('Admin create approval commits once, generates code at acceptance and audits the proposal', async () => {
  const f = await fixture();
  try {
    const owner = await f.login(f.owner.phone_number);
    const admin = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const proposal = f.trees.createRequest(f.admin.id, f.treeInput);
    assert.equal(proposal.tree_id, null);
    assert.equal(f.trees.list(f.owner.id, page).total, 0);
    assert.equal(f.trees.listRequests(f.owner.id, { ...page, status: 'Pending' }).total, 1);
    assert.equal(f.trees.listRequests(f.worker.id, page).total, 0);
    assert.throws(() => f.trees.getRequest(f.worker.id, proposal.id), /Không tìm thấy/);
    assert.equal((await f.http(`tree-requests/${proposal.id}/approve`, 'PATCH', {}, admin)).status, 403);
    assert.equal((await f.http(`tree-requests/${proposal.id}/approve`, 'PATCH', { tree_code: 'CLIENT' }, owner)).status, 400);
    const results = await Promise.all([f.http(`tree-requests/${proposal.id}/approve`, 'PATCH', {}, owner),
      f.http(`tree-requests/${proposal.id}/approve`, 'PATCH', {}, owner)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const accepted = f.trees.getRequest(f.owner.id, proposal.id);
    assert.equal(accepted.status, 'Accepted');
    const tree = f.trees.get(f.owner.id, accepted.tree_id!);
    assert.equal(tree.tree_code, `DRN-${tree.id}`);
    const history = f.trees.history(f.owner.id, tree.id, page).items;
    assert.equal(history.length, 1);
    assert.equal(history[0].actor_id, f.owner.id);
    assert.equal(history[0].proposed_by, f.admin.id);
    assert.equal(history[0].request_id, proposal.id);
    assert.equal(history[0].before, null);
    f.trees.reject(f.owner.id, f.trees.createRequest(f.admin.id, f.treeInput).id, 'Không cần');
    assert.equal(f.trees.list(f.owner.id, page).total, 1);
    assert.throws(() => f.trees.reject(f.owner.id, proposal.id), /đã được xử lý/);
  } finally { await f.app.close(); }
});

test('Pending update detects owner edits and rechecks actors without partial data or audit writes', async () => {
  const f = await fixture();
  try {
    const tree = f.trees.create(f.owner.id, f.treeInput);
    const proposal = f.trees.updateRequest(f.admin.id, tree.id, { variety: 'Monthong' });
    assert.throws(() => f.trees.updateRequest(f.admin.id, tree.id, { status: 'Dead' }), /Pending/);
    f.trees.update(f.owner.id, tree.id, { status: 'Removed' });
    assert.throws(() => f.trees.approve(f.owner.id, proposal.id), /đã thay đổi/);
    assert.equal(f.trees.getRequest(f.owner.id, proposal.id).status, 'Pending');
    assert.equal(f.trees.history(f.owner.id, tree.id, page).total, 2);
    f.trees.reject(f.owner.id, proposal.id);
    const next = f.trees.updateRequest(f.admin.id, tree.id, { status: 'Active' });
    f.admin.status = 'Locked';
    assert.throws(() => f.trees.approve(f.owner.id, next.id), /Active/);
    f.admin.status = 'Active';
    f.admin.role = 'Farmer';
    assert.throws(() => f.trees.approve(f.owner.id, next.id), /không còn là Admin/);
    f.admin.role = 'Admin';
    f.owner.status = 'Locked';
    assert.throws(() => f.trees.approve(f.owner.id, next.id), /Active/);
    f.owner.status = 'Active';
    assert.equal(f.trees.getRequest(f.owner.id, next.id).status, 'Pending');
    assert.equal(f.trees.history(f.owner.id, tree.id, page).total, 2);
    f.trees.approve(f.owner.id, next.id);
    assert.equal(f.trees.get(f.owner.id, tree.id).status, 'Active');
    assert.equal(f.trees.history(f.owner.id, tree.id, page).total, 3);
  } finally { await f.app.close(); }
});

test('Tree status restoration preserves snapshots and copies cannot rewrite Trees, requests or history', async () => {
  const f = await fixture();
  try {
    const tree = f.trees.create(f.owner.id, f.treeInput);
    tree.variety = 'Mutation';
    f.trees.update(f.owner.id, tree.id, { status: 'Dead' });
    f.trees.update(f.owner.id, tree.id, { status: 'Active' });
    f.trees.update(f.owner.id, tree.id, { status: 'Removed' });
    const proposal = f.trees.updateRequest(f.admin.id, tree.id, { status: 'Active' });
    proposal.proposed_changes.status = 'Dead';
    proposal.tree_snapshot!.variety = 'Mutation';
    f.trees.approve(f.owner.id, proposal.id);
    const history = f.trees.history(f.owner.id, tree.id, page).items;
    assert.deepEqual(history.map((h) => h.version), [1, 2, 3, 4, 5]);
    assert.deepEqual(history.map((h) => h.after.status), ['Active', 'Dead', 'Active', 'Removed', 'Active']);
    assert.ok(history.every((h) => h.after.tree_code === tree.tree_code && h.after.zone_id === f.zone.id));
    assert.equal(history[4].before!.status, 'Removed');
    history[4].after.status = 'Dead';
    history[0].after.variety = 'Mutation';
    const list = f.trees.list(f.owner.id, page);
    list.items[0].variety = 'Mutation';
    assert.equal(f.trees.get(f.owner.id, tree.id).variety, 'Ri6');
    assert.equal(f.trees.history(f.owner.id, tree.id, page).items[4].after.status, 'Active');
    assert.equal(f.trees.getRequest(f.owner.id, proposal.id).tree_snapshot!.variety, 'Ri6');
    assert.throws(() => f.trees.update(f.owner.id, tree.id, { zone_id: randomUUID() } as never), /Không sửa/);
  } finally { await f.app.close(); }
});

test('Trees reuse current HTX and accepted assignment scope, retaining separate assignment history', async (context) => {
  const f = await fixture();
  try {
    const tree = f.trees.create(f.owner.id, f.treeInput);
    const anotherZone = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Other' });
    const otherTree = f.trees.create(f.owner.id, { ...f.treeInput, zone_id: anotherZone.id });
    f.join();
    assert.equal(f.trees.get(f.manager.id, tree.id).id, tree.id);
    assert.equal(f.trees.history(f.manager.id, tree.id, page).total, 1);
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.equal(f.trees.list(f.manager.id, page).total, 0);
    assert.throws(() => f.trees.get(f.manager.id, tree.id), /phạm vi/);
    const assignments = f.app.get(AssignmentsService);
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const invitation = assignments.createRequest(f.owner.id, f.zone.id, { user_id: f.worker.id, start_date: start, end_date: end });
    assert.equal(f.trees.list(f.worker.id, page).total, 0);
    const accepted = assignments.approve(f.worker.id, invitation.id);
    const time = context.mock.method(Date, 'now', () => Date.parse(start) - 1);
    assert.throws(() => f.trees.get(f.worker.id, tree.id), /phạm vi/);
    time.mock.mockImplementation(() => Date.parse(start));
    assert.equal(f.trees.getByCode(f.worker.id, tree.tree_code).id, tree.id);
    assert.equal(f.trees.list(f.worker.id, page).total, 1);
    assert.throws(() => f.trees.get(f.worker.id, otherTree.id), /phạm vi/);
    assert.throws(() => f.farms.get(f.worker.id, f.farm.id), /phạm vi/);
    assert.throws(() => f.trees.update(f.worker.id, tree.id, { status: 'Dead' }), /Chỉ chủ Farm/);
    time.mock.mockImplementation(() => Date.parse(end));
    assert.throws(() => f.trees.history(f.worker.id, tree.id, page), /phạm vi/);
    assert.equal(f.trees.list(f.worker.id, page).total, 0);
    assert.equal(assignments.get(f.worker.id, accepted.assignment_id!).assignment.id, accepted.assignment_id);
    assert.equal(assignments.list(f.worker.id, page, true).total, 1);
  } finally { await f.app.close(); }
});

test('Tree list and metadata history pagination filter before slicing and reject invalid queries', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    const a = f.trees.create(f.owner.id, f.treeInput);
    f.trees.create(f.owner.id, { ...f.treeInput, variety: 'Monthong', status: 'Dead' });
    const otherZone = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Other' });
    f.trees.create(f.owner.id, { ...f.treeInput, zone_id: otherZone.id });
    assert.equal(f.trees.list(f.owner.id, { ...page, zone_id: f.zone.id, status: 'Active' }).total, 1);
    assert.equal(f.trees.list(f.owner.id, { ...page, q: a.tree_code }).total, 1);
    assert.equal(f.trees.list(f.owner.id, { ...page, q: 'ri6', limit: 1, offset: 1 }).total, 2);
    assert.equal(f.trees.list(f.owner.id, { ...page, q: 'ri6', limit: 1, offset: 1 }).items[0].zone_id, otherZone.id);
    assert.equal(f.trees.list(f.worker.id, { ...page, zone_id: f.zone.id }).total, 0);
    f.trees.update(f.owner.id, a.id, { status: 'Dead' });
    assert.equal(f.trees.history(f.owner.id, a.id, { limit: 1, offset: 1 }).items[0].version, 2);
    for (const query of ['limit=101', 'limit=0', 'offset=-1', 'offset=100001', 'q=' + 'a'.repeat(101), 'status=bad', 'zone_id=bad', 'farm_id=' + f.farm.id]) {
      assert.equal((await f.http('trees?' + query, 'GET', undefined, token)).status, 400, query);
    }
    assert.equal((await f.http('tree-requests?status=bad', 'GET', undefined, token)).status, 400);
    assert.equal((await f.http(`trees/${a.id}/history?limit=101`, 'GET', undefined, token)).status, 400);
  } finally { await f.app.close(); }
});

test('Full metadata history refuses approval atomically and preserves Pending request and current Tree', async () => {
  const f = await fixture();
  try {
    const tree = f.trees.create(f.owner.id, f.treeInput);
    const proposal = f.trees.createRequest(f.admin.id, f.treeInput);
    for (let i = 1; i < TREE_HISTORY_LIMIT; i++) {
      f.trees.update(f.owner.id, tree.id, { variety: `Ri6-${i}` });
    }
    const before = f.trees.get(f.owner.id, tree.id);
    assert.throws(() => f.trees.approve(f.owner.id, proposal.id), /lịch sử cây đã đầy/);
    assert.throws(() => f.trees.update(f.owner.id, tree.id, { status: 'Dead' }), /lịch sử cây đã đầy/);
    assert.deepEqual(f.trees.get(f.owner.id, tree.id), before);
    assert.equal(f.trees.list(f.owner.id, page).total, 1);
    assert.equal(f.trees.history(f.owner.id, tree.id, page).total, TREE_HISTORY_LIMIT);
    assert.equal(f.trees.getRequest(f.owner.id, proposal.id).status, 'Pending');
    assert.equal(f.trees.getRequest(f.owner.id, proposal.id).tree_id, null);
    assert.equal(f.trees.reject(f.owner.id, proposal.id).status, 'Rejected');
  } finally { await f.app.close(); }
});
