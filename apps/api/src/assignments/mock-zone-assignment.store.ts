import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TestZone } from '../zones/zones.types';
import { assignmentActive, intervalsOverlap } from './assignment-policy';
import { AssignmentHistory } from './assignments.types';

@Injectable()
export class MockZoneAssignmentStore {
  private readonly records = new Map<string, AssignmentHistory>();

  list(): AssignmentHistory[] { return structuredClone([...this.records.values()]); }

  get(id: string): AssignmentHistory {
    const entry = this.records.get(id);
    if (!entry) { throw new NotFoundException('Không tìm thấy phân công'); }
    return structuredClone(entry);
  }

  hasActive(userId: string, zoneId: string, now = Date.now()): boolean {
    return [...this.records.values()].some(({ assignment }) => assignment.user_id === userId
      && assignment.zone_id === zoneId && assignmentActive(assignment, now));
  }

  assertAvailable(zoneId: string, start: string, end: string | null): void {
    if ([...this.records.values()].some(({ assignment }) => assignment.zone_id === zoneId && intervalsOverlap(start, end, assignment))) {
      throw new ConflictException('Zone đã có phân công giao nhau trong khoảng thời gian này');
    }
  }

  accept(userId: string, zone: TestZone, start: string, end: string | null, now: string): AssignmentHistory {
    if (this.records.size >= 2000) { throw new HttpException('Bộ nhớ lịch sử phân công đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    this.assertAvailable(zone.id, start, end);
    const entry: AssignmentHistory = { assignment: { id: randomUUID(), user_id: userId, zone_id: zone.id, start_date: start, end_date: end },
      zone_snapshot: structuredClone(zone), accepted_at: now };
    this.records.set(entry.assignment.id, entry);
    return structuredClone(entry);
  }

  end(id: string, now: string): AssignmentHistory {
    const entry = this.get(id);
    if (!assignmentActive(entry.assignment, Date.parse(now))) { throw new ConflictException('Chỉ kết thúc phân công đang có hiệu lực'); }
    entry.assignment.end_date = now;
    this.records.set(id, entry);
    return structuredClone(entry);
  }
}
