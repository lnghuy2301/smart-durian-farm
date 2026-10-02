import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateCooperativeDto } from './users.dto';

export interface TestCooperative extends CreateCooperativeDto { id: string; manager_id: string | null }

@Injectable()
export class MockCooperativeStore {
  private readonly cooperatives = new Map<string, TestCooperative>();

  // Store dùng chung cho luồng duyệt và module HTX sau; chưa ghi database.
  create(input: CreateCooperativeDto, managerId: string | null): TestCooperative {
    if ([...this.cooperatives.values()].some((coop) => coop.certificate_number === input.certificate_number)) {
      throw new ConflictException('HTX có số chứng nhận này đã tồn tại; hãy chọn HTX hiện có');
    }
    if (this.cooperatives.size >= 100) { throw new ConflictException('Bộ nhớ HTX test đã đầy'); }
    const cooperative = { ...input, id: randomUUID(), manager_id: managerId };
    this.cooperatives.set(cooperative.id, cooperative);
    return cooperative;
  }

  assign(id: string, managerId: string): TestCooperative {
    const cooperative = this.cooperatives.get(id);
    if (!cooperative) { throw new NotFoundException('Không tìm thấy HTX'); }
    if (cooperative.manager_id) { throw new ConflictException('HTX đã có Manager; không tự ghi đè người quản lý'); }
    cooperative.manager_id = managerId;
    return cooperative;
  }

  list(): TestCooperative[] { return [...this.cooperatives.values()].map((cooperative) => ({ ...cooperative })); }
}
