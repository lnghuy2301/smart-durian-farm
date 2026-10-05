import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { MockZoneAssignmentStore } from '../src/assignments/mock-zone-assignment.store';
import { AssignmentRequest, UserZoneAssignment } from '../src/assignments/assignments.types';
import { assignmentActive, assignmentAllowsCorrection, intervalsOverlap } from '../src/assignments/assignment-policy';

const page = { limit: 20, offset: 0 };

test('Owner invitation gives no access before assignee acceptance; acceptance is atomic and revokes on end', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const ownerToken = await f.login(f.owner.phone_number);
    const workerToken = await f.login(f.worker.phone_number);
    assert.throws(() => service.assertCanWork(f.owner.id, zone.id), /không có phân công/);
    assert.equal((await f.http(`zones/${zone.id}/assignment-requests`, 'POST', { user_id: f.worker.id })).status, 401);
    const response = await f.http(`zones/${zone.id}/assignment-requests`, 'POST', { user_id: f.worker.id }, ownerToken);
    assert.equal(response.status, 201);
    const invitation = await response.json() as AssignmentRequest;
    assert.deepEqual(invitation.required_approvals.map((a) => a.purpose), ['Assignee']);
    assert.equal(service.list(f.worker.id, page, true).total, 0);
    assert.equal(f.zones.list(f.worker.id, page).total, 0);
    assert.equal(service.getRequest(f.worker.id, invitation.id).id, invitation.id);
    assert.throws(() => service.approve(f.owner.id, invitation.id), /không phải bên/);
    const approvals = await Promise.all([f.http(`assignment-requests/${invitation.id}/approve`, 'PATCH', {}, workerToken),
      f.http(`assignment-requests/${invitation.id}/approve`, 'PATCH', {}, workerToken)]);
    assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
    const accepted = service.getRequest(f.owner.id, invitation.id);
    assert.ok(accepted.assignment_id);
    assert.equal(f.zones.get(f.worker.id, zone.id).id, zone.id);
    service.assertCanWork(f.worker.id, zone.id);
    assert.throws(() => f.farms.get(f.worker.id, f.farm.id), /phạm vi/);
    assert.throws(() => f.zones.update(f.worker.id, zone.id, { zone_name: 'Bypass' }), /Chỉ chủ Farm/);
    assert.equal((await f.http(`zone-assignments/${accepted.assignment_id}/end`, 'PATCH', {}, workerToken)).status, 403);
    const event = { assignment_id: accepted.assignment_id!, zone_id: zone.id, author_id: f.worker.id,
      created_at: service.get(f.worker.id, accepted.assignment_id!).assignment.start_date };
    assert.equal((await f.http(`zone-assignments/${accepted.assignment_id}/end`, 'PATCH', {}, ownerToken)).status, 200);
    assert.throws(() => service.assertCanWork(f.worker.id, zone.id), /không có phân công/);
    assert.equal((await f.http(`zones/${zone.id}`, 'GET', undefined, workerToken)).status, 404);
    const history = await f.http('zone-assignments/mine', 'GET', undefined, workerToken);
    assert.equal(history.status, 200);
    assert.equal((await history.json() as { total: number }).total, 1);
    const entry = service.get(f.worker.id, accepted.assignment_id!);
    assert.equal(entry.active, false);
    assert.equal(entry.zone_snapshot.zone_name, 'Khu A');
    assert.equal(entry.correction_grace_days, 15);
    service.assertCanCorrect(f.worker.id, event);
    assert.throws(() => service.assertCanCorrect(f.owner.id, event), /Chỉ tác giả/);
    assert.throws(() => service.assertCanCorrect(f.worker.id, { ...event, zone_id: randomUUID() }), /Chỉ tác giả/);
    f.zones.update(f.owner.id, zone.id, { zone_name: 'Đổi sau hết phân công' });
    assert.equal(service.get(f.worker.id, accepted.assignment_id!).zone_snapshot.zone_name, 'Khu A');
  } finally { await f.app.close(); }
});

test('Admin proposal requires both owner and Farmer, in either order, rechecking states and snapshot', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const proposal = service.createRequest(f.admin.id, zone.id, { user_id: f.worker.id });
    assert.deepEqual(proposal.required_approvals.map((a) => a.purpose), ['Owner', 'Assignee']);
    assert.throws(() => service.approve(f.admin.id, proposal.id), /Farmer Active/);
    assert.equal(service.approve(f.worker.id, proposal.id).status, 'Pending');
    assert.throws(() => service.assertCanWork(f.worker.id, zone.id), /không có phân công/);
    f.worker.status = 'Locked';
    assert.throws(() => service.approve(f.owner.id, proposal.id), /Active/);
    assert.equal(service.getRequest(f.owner.id, proposal.id).required_approvals[0].approved_at, null);
    f.worker.status = 'Active';
    f.zones.update(f.owner.id, zone.id, { zone_name: 'Đổi trong khi chờ' });
    assert.throws(() => service.approve(f.owner.id, proposal.id), /Zone đã thay đổi/);
    service.reject(f.owner.id, proposal.id, 'Mời lại theo dữ liệu mới');
    const second = service.createRequest(f.admin.id, zone.id, { user_id: f.worker.id });
    assert.equal(service.approve(f.owner.id, second.id).status, 'Pending');
    f.admin.status = 'Locked';
    assert.throws(() => service.approve(f.worker.id, second.id), /Active/);
    f.admin.status = 'Active';
    assert.equal(service.approve(f.worker.id, second.id).status, 'Accepted');
    service.assertCanWork(f.worker.id, zone.id);
  } finally { await f.app.close(); }
});

test('Assignment schedule forbids accepted and Pending overlaps, permits adjacent intervals and multiple Zones', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const zone2 = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Khu B' });
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const invitation = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id, start_date: start, end_date: end });
    assert.throws(() => service.createRequest(f.admin.id, zone.id, { user_id: f.owner.id, start_date: start }), /Pending giao nhau/);
    const accepted = service.approve(f.worker.id, invitation.id);
    assert.throws(() => service.createRequest(f.owner.id, zone.id, { user_id: f.owner.id, start_date: start, end_date: end }), /phân công giao nhau/);
    assert.throws(() => service.assertCanWork(f.worker.id, zone.id), /không có phân công/);
    assert.throws(() => service.end(f.owner.id, accepted.assignment_id!), /đang có hiệu lực/);
    const adjacent = service.createRequest(f.owner.id, zone.id, { user_id: f.owner.id, start_date: end });
    assert.equal(service.approve(f.owner.id, adjacent.id).status, 'Accepted', 'owner explicitly accepts own work');
    const another = service.createRequest(f.owner.id, zone2.id, { user_id: f.worker.id, start_date: start, end_date: end });
    service.approve(f.worker.id, another.id);
    assert.equal(service.list(f.worker.id, page, true).total, 2);
    const zone3 = f.zones.create(f.owner.id, { ...f.input, zone_name: 'Khu C' });
    const ownerAsWorker = service.createRequest(f.admin.id, zone3.id, { user_id: f.owner.id });
    const selfAccepted = service.approve(f.owner.id, ownerAsWorker.id);
    assert.equal(selfAccepted.status, 'Accepted');
    assert.ok(selfAccepted.required_approvals.every((a) => a.approved_at));
    const schedule = service.get(f.worker.id, accepted.assignment_id!).assignment;
    assert.equal(assignmentActive(schedule, Date.parse(start) - 1), false);
    assert.equal(assignmentActive(schedule, Date.parse(start)), true);
    assert.equal(assignmentActive(schedule, Date.parse(end)), false);
  } finally { await f.app.close(); }
});

test('Concurrent overlapping invitations reserve only once and cancellation releases the interval', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const ownerToken = await f.login(f.owner.phone_number);
    const responses = await Promise.all([f.http(`zones/${zone.id}/assignment-requests`, 'POST', { user_id: f.worker.id }, ownerToken),
      f.http(`zones/${zone.id}/assignment-requests`, 'POST', { user_id: f.owner.id }, ownerToken)]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    const pending = service.listRequests(f.owner.id, { ...page, status: 'Pending' });
    assert.equal(pending.total, 1);
    const proposal = pending.items[0];
    const managerToken = await f.login(f.manager.phone_number);
    assert.equal((await f.http(`assignment-requests/${proposal.id}/reject`, 'PATCH', {}, managerToken)).status, 403);
    service.reject(f.owner.id, proposal.id, 'Chủ rút lời mời');
    const replacement = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id });
    replacement.required_approvals[0].approved_at = new Date().toISOString();
    assert.equal(service.getRequest(f.owner.id, replacement.id).required_approvals[0].approved_at, null);
    assert.equal(service.approve(f.worker.id, replacement.id).status, 'Accepted');
  } finally { await f.app.close(); }
});

test('Admin early termination needs owner and is possible for Locked assignee; rejection releases Pending reservation', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const first = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id });
    service.reject(f.worker.id, first.id, 'Không nhận việc');
    const next = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id });
    const accepted = service.approve(f.worker.id, next.id);
    assert.throws(() => service.end(f.admin.id, accepted.assignment_id!), /Admin phải đề xuất/);
    const end = service.endRequest(f.admin.id, accepted.assignment_id!);
    assert.throws(() => service.endRequest(f.admin.id, accepted.assignment_id!), /đang chờ/);
    assert.throws(() => service.approve(f.worker.id, end.id), /không phải bên/);
    service.assertCanWork(f.worker.id, zone.id);
    f.worker.status = 'Locked';
    assert.equal(service.approve(f.owner.id, end.id).status, 'Accepted');
    f.worker.status = 'Active';
    assert.throws(() => service.assertCanWork(f.worker.id, zone.id), /không có phân công/);
    assert.throws(() => service.end(f.owner.id, accepted.assignment_id!), /đang có hiệu lực/);
    assert.equal(service.get(f.worker.id, accepted.assignment_id!).active, false);
    const again = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id });
    assert.equal(service.approve(f.worker.id, again.id).status, 'Accepted');
    assert.equal(service.list(f.worker.id, page, true).total, 2, 'old record is kept');
  } finally { await f.app.close(); }
});

test('Correction stops exactly 15 days after end; new assignment cannot extend old event rights', async () => {
  const start = '2026-01-01T00:00:00.000Z';
  const end = '2026-01-02T00:00:00.000Z';
  const assignment: UserZoneAssignment = { id: randomUUID(), user_id: randomUUID(), zone_id: randomUUID(), start_date: start, end_date: end };
  const deadline = Date.parse(end) + 15 * 86400000;
  assert.equal(assignmentAllowsCorrection(assignment, start, Date.parse(end)), true);
  assert.equal(assignmentAllowsCorrection(assignment, start, deadline - 1), true);
  assert.equal(assignmentAllowsCorrection(assignment, start, deadline), false);
  assert.equal(assignmentAllowsCorrection(assignment, end, deadline - 1), false);
  assert.equal(assignmentAllowsCorrection(assignment, 'bad', deadline - 1), false);
  assert.equal(assignmentAllowsCorrection(assignment, start, Date.parse(start) - 1), false);
  assert.equal(intervalsOverlap(end, null, assignment), false);
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const store = f.app.get(MockZoneAssignmentStore);
    const zone = f.zones.create(f.owner.id, f.input);
    const oldStart = new Date(Date.now() - 20 * 86400000).toISOString();
    const oldEnd = new Date(Date.now() - 16 * 86400000).toISOString();
    const old = store.accept(f.worker.id, zone, oldStart, oldEnd, oldStart);
    const current = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id });
    service.approve(f.worker.id, current.id);
    service.assertCanWork(f.worker.id, zone.id);
    assert.throws(() => service.assertCanCorrect(f.worker.id, { assignment_id: old.assignment.id, zone_id: zone.id,
      author_id: f.worker.id, created_at: oldStart }), /tối đa 15 ngày/);
    assert.equal(service.list(f.worker.id, page, true).total, 2, 'history remains readable after correction deadline');
    const stranger = f.users.add({ ...f.users.publicUser(), phone_number: '0900000004', password: f.owner.password });
    assert.throws(() => service.get(stranger.id, old.assignment.id), /phạm vi/);
  } finally { await f.app.close(); }
});

test('Assignments HTTP rejects malformed dates, foreign fields and invalid targets; Manager is read only', async () => {
  const f = await zoneFixture();
  try {
    const service = f.app.get(AssignmentsService);
    const zone = f.zones.create(f.owner.id, f.input);
    const token = await f.login(f.owner.phone_number);
    for (const invalid of [{ user_id: null }, { user_id: '0900000002' }, { start_date: null }, { start_date: '2026-10-04' },
      { start_date: '2026-10-04T00:00:00' }, { end_date: 'bad' }, { end_date: '2026-02-30T00:00:00Z' },
      { status: 'Accepted' }, { approved_at: new Date().toISOString() }]) {
      assert.equal((await f.http(`zones/${zone.id}/assignment-requests`, 'POST', { user_id: f.worker.id, ...invalid }, token)).status, 400);
    }
    assert.throws(() => service.createRequest(f.owner.id, zone.id, { user_id: f.manager.id }), /Farmer Active/);
    assert.throws(() => service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id, end_date: '2020-01-01T00:00:00Z' }), /end_date/);
    assert.throws(() => service.createRequest(f.worker.id, zone.id, { user_id: f.owner.id }), /Chỉ chủ Farmer/);
    const invitation = service.createRequest(f.owner.id, zone.id, { user_id: f.worker.id, start_date: '2020-01-01T00:00:00Z' });
    const accepted = service.approve(f.worker.id, invitation.id);
    const entry = service.get(f.worker.id, accepted.assignment_id!);
    assert.ok(Date.parse(entry.assignment.start_date) >= Date.parse(entry.accepted_at));
    assert.equal(service.list(f.manager.id, page).total, 0);
    f.join();
    assert.equal(service.list(f.manager.id, page).total, 1);
    assert.throws(() => service.createRequest(f.manager.id, zone.id, { user_id: f.worker.id }), /Chỉ chủ Farmer/);
    assert.throws(() => service.reject(f.manager.id, invitation.id), /đã được xử lý/);
    entry.assignment.end_date = '2020-01-01T00:00:00Z';
    assert.equal(service.get(f.worker.id, accepted.assignment_id!).assignment.end_date, null);
    f.worker.status = 'Locked';
    assert.throws(() => service.assertCanWork(f.worker.id, zone.id), /Active/);
    f.worker.status = 'Active';
    f.farms.approve(f.admin.id, f.farms.leaveRequest(f.owner.id, f.farm.id).id);
    assert.equal(service.list(f.manager.id, page).total, 0);
    assert.equal(service.list(f.worker.id, page, true).total, 1);
  } finally { await f.app.close(); }
});
