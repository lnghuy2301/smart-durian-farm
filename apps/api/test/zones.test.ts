import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';

test('Zones owner writes, Admin proposes and only the owner approves; DTOs cannot bypass scope', async () => {
  const f = await zoneFixture();
  try {
    const ownerToken = await f.login(f.owner.phone_number);
    const adminToken = await f.login(f.admin.phone_number, 'LocalAdminOnly123!');
    const workerToken = await f.login(f.worker.phone_number);
    assert.equal((await f.http('zones')).status, 401);
    assert.equal((await f.http('zones', 'POST', f.input, adminToken)).status, 403);
    assert.equal((await f.http('zones', 'POST', f.input, workerToken)).status, 403);
    for (const invalid of [{ zone_name: ' ' }, { area_size: 0 }, { area_size: 0.0001 }, { area_size: '1' },
      { longitude: 181 }, { latitude: 91 }, { longitude: 1.12345678 }, { standard_id: null }, { farm_id: null }, { status: 'Active' }]) {
      assert.equal((await f.http('zones', 'POST', { ...f.input, ...invalid }, ownerToken)).status, 400);
    }
    const zone = f.zones.create(f.owner.id, f.input);
    assert.equal((await f.http(`zones/${zone.id}`, 'PATCH', { farm_id: randomUUID() }, ownerToken)).status, 400);
    assert.equal((await f.http(`zones/${zone.id}`, 'GET', undefined, workerToken)).status, 404);
    assert.throws(() => f.zones.update(f.worker.id, zone.id, { zone_name: 'Bypass' }), /Chỉ chủ Farm/);
    assert.throws(() => f.zones.update(f.owner.id, zone.id, {}), /Cần ít nhất/);
    const proposal = f.zones.updateRequest(f.admin.id, zone.id, { zone_name: 'Khu mới' });
    assert.equal(f.zones.get(f.owner.id, zone.id).zone_name, 'Khu A');
    assert.throws(() => f.zones.approve(f.admin.id, proposal.id), /Chỉ chủ Farmer/);
    assert.throws(() => f.zones.approve(f.worker.id, proposal.id), /Chỉ chủ Farmer/);
    const approvals = await Promise.all([f.http(`zone-requests/${proposal.id}/approve`, 'PATCH', {}, ownerToken),
      f.http(`zone-requests/${proposal.id}/approve`, 'PATCH', {}, ownerToken)]);
    assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
    assert.equal(f.zones.get(f.owner.id, zone.id).zone_name, 'Khu mới');
    const create = f.zones.createRequest(f.admin.id, { ...f.input, zone_name: 'Khu B' });
    assert.equal(f.zones.list(f.owner.id, { limit: 20, offset: 0 }).total, 1);
    f.zones.reject(f.owner.id, create.id, 'Không cần thêm');
    assert.equal(f.zones.list(f.owner.id, { limit: 20, offset: 0 }).total, 1);
    const accepted = f.zones.approve(f.owner.id, f.zones.createRequest(f.admin.id, f.input).id);
    assert.ok(accepted.zone_id);
    assert.equal(accepted.status, 'Accepted');
    assert.equal((await f.http('zones?limit=101', 'GET', undefined, ownerToken)).status, 400);
    assert.equal((await f.http('zones?farm_id=bad', 'GET', undefined, ownerToken)).status, 400);
  } finally { await f.app.close(); }
});

test('Area budget is exact and checked again on Farm shrink and Zone approval without partial commits', async () => {
  const f = await zoneFixture();
  try {
    const shrink = f.farms.updateRequest(f.owner.id, f.farm.id, { area_size: 0.3 });
    const a = f.zones.create(f.owner.id, { ...f.input, area_size: 0.1 });
    f.zones.create(f.owner.id, { ...f.input, area_size: 0.2 });
    f.farms.approve(f.admin.id, shrink.id); // 0.1 + 0.2 fits decimal 0.3 exactly.
    assert.throws(() => f.zones.create(f.owner.id, { ...f.input, area_size: 0.001 }), /vượt quá/);
    const shrinkAgain = f.farms.updateRequest(f.owner.id, f.farm.id, { area_size: 0.299 });
    assert.throws(() => f.farms.approve(f.admin.id, shrinkAgain.id), /vượt quá/);
    assert.equal(f.farms.get(f.owner.id, f.farm.id).area_size, 0.3);
    assert.equal(f.farms.getRequest(f.admin.id, shrinkAgain.id).status, 'Pending');
    f.farms.reject(f.admin.id, shrinkAgain.id);
    const proposal = f.zones.updateRequest(f.admin.id, a.id, { area_size: 0.09 });
    f.zones.update(f.owner.id, a.id, { zone_name: 'Sửa trong khi chờ' });
    assert.throws(() => f.zones.approve(f.owner.id, proposal.id), /đã thay đổi/);
    f.zones.reject(f.owner.id, proposal.id);
    f.zones.update(f.owner.id, a.id, { area_size: 0.09 });
    const create = f.zones.createRequest(f.admin.id, { ...f.input, area_size: 0.01 });
    f.zones.create(f.owner.id, { ...f.input, area_size: 0.01 });
    assert.throws(() => f.zones.approve(f.owner.id, create.id), /vượt quá/);
    assert.equal(f.zones.getRequest(f.owner.id, create.id).status, 'Pending');
  } finally { await f.app.close(); }
});

test('Standards are Active on new links; historical links survive Inactive, with rechecks at approval', async () => {
  const f = await zoneFixture();
  try {
    const zone = f.zones.create(f.owner.id, f.input);
    const create = f.zones.createRequest(f.admin.id, f.input);
    f.standards.update(f.standard.id, { status: 'Inactive' });
    assert.throws(() => f.zones.approve(f.owner.id, create.id), /phải Active/);
    assert.equal(f.zones.update(f.owner.id, zone.id, { zone_name: 'Giữ liên kết cũ' }).standard_id, f.standard.id);
    assert.throws(() => f.zones.create(f.owner.id, f.input), /phải Active/);
    assert.throws(() => f.zones.update(f.owner.id, zone.id, { standard_id: randomUUID() }), /Không tìm thấy tiêu chuẩn/);
    const next = f.standards.create({ code: 'NEW', name: 'New', description: '', certifying_body: 'Demo' });
    const proposal = f.zones.updateRequest(f.admin.id, zone.id, { standard_id: next.id });
    f.standards.update(next.id, { status: 'Inactive' });
    assert.throws(() => f.zones.approve(f.owner.id, proposal.id), /phải Active/);
    assert.equal(f.zones.get(f.owner.id, zone.id).standard_id, f.standard.id);
  } finally { await f.app.close(); }
});

test('Manager reads only current Cooperative Zones and cannot mutate; returned copies cannot change data', async () => {
  const f = await zoneFixture();
  try {
    const zone = f.zones.create(f.owner.id, f.input);
    assert.equal(f.zones.list(f.manager.id, { limit: 20, offset: 0 }).total, 0);
    f.join();
    assert.equal(f.zones.get(f.manager.id, zone.id).id, zone.id);
    assert.throws(() => f.zones.createRequest(f.manager.id, f.input), /Admin phải/);
    assert.throws(() => f.zones.update(f.manager.id, zone.id, { zone_name: 'Sai quyền' }), /Chỉ chủ Farmer/);
    assert.equal(f.zones.listRequests(f.manager.id, { limit: 20, offset: 0 }).total, 0);
    const copy = f.zones.get(f.owner.id, zone.id);
    copy.area_size = 999;
    assert.equal(f.zones.get(f.owner.id, zone.id).area_size, 0.3);
    const proposal = f.zones.updateRequest(f.admin.id, zone.id, { zone_name: 'Đúng' });
    proposal.proposed_changes.zone_name = 'Sửa ngoài';
    f.admin.status = 'Locked';
    assert.throws(() => f.zones.approve(f.owner.id, proposal.id), /Active/);
    f.admin.status = 'Active';
    f.zones.approve(f.owner.id, proposal.id);
    assert.equal(f.zones.get(f.owner.id, zone.id).zone_name, 'Đúng');
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.throws(() => f.zones.get(f.manager.id, zone.id), /phạm vi/);
  } finally { await f.app.close(); }
});
