import { UserZoneAssignment } from './assignments.types';

export const CORRECTION_GRACE_DAYS = 15;
const CORRECTION_GRACE_MS = CORRECTION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function assignmentActive(assignment: UserZoneAssignment, now = Date.now()): boolean {
  return now >= Date.parse(assignment.start_date)
    && (assignment.end_date === null || now < Date.parse(assignment.end_date));
}

export function intervalsOverlap(start: string, end: string | null, other: Pick<UserZoneAssignment, 'start_date' | 'end_date'>): boolean {
  return Date.parse(start) < (other.end_date === null ? Infinity : Date.parse(other.end_date))
    && Date.parse(other.start_date) < (end === null ? Infinity : Date.parse(end));
}

// authoredAt là giờ tạo event lưu ở server, không phải ngày nghiệp vụ client tự khai.
// Dùng assignment gốc của event để phân công mới không gia hạn quyền sửa lịch sử cũ.
export function assignmentAllowsCorrection(assignment: UserZoneAssignment, authoredAt: string, now = Date.now()): boolean {
  const created = Date.parse(authoredAt);
  if (!Number.isFinite(created) || created > now || !assignmentActive(assignment, created)) { return false; }
  if (assignmentActive(assignment, now)) { return true; }
  if (assignment.end_date === null) { return false; }
  const ended = Date.parse(assignment.end_date);
  return now >= ended && now < ended + CORRECTION_GRACE_MS;
}
