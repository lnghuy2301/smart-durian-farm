import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateCooperativeDto } from './users.dto';

export interface TestCooperative extends CreateCooperativeDto { id: string; manager_id: string | null }

@Injectable()
export class MockCooperativeStore {
  private readonly cooperatives = new Map<string, TestCooperative>();
  private readonly metadata = new Map<string, { createdAt: number; version: number }>();

  // Store dùng chung cho luồng duyệt và module HTX sau; chưa ghi database.
  create(input: CreateCooperativeDto, managerId: string | null): TestCooperative {
    if (managerId) { this.requireUnassignedManager(managerId); }
    if ([...this.cooperatives.values()].some((coop) => coop.certificate_number === input.certificate_number)) {
      throw new ConflictException('HTX có số chứng nhận này đã tồn tại; hãy chọn HTX hiện có');
    }
    if (this.cooperatives.size >= 100) { throw new ConflictException('Bộ nhớ HTX test đã đầy'); }
    const cooperative = { ...input, id: randomUUID(), manager_id: managerId };
    this.cooperatives.set(cooperative.id, cooperative);
    this.metadata.set(cooperative.id, { createdAt: Date.now(), version: 1 });
    return { ...cooperative };
  }

  assign(id: string, managerId: string): TestCooperative {
    const cooperative = this.cooperatives.get(id);
    if (!cooperative) { throw new NotFoundException('Không tìm thấy HTX'); }
    if (cooperative.manager_id) { throw new ConflictException('HTX đã có Manager; không tự ghi đè người quản lý'); }
    this.requireUnassignedManager(managerId);
    cooperative.manager_id = managerId;
    this.metadata.get(id)!.version++;
    return { ...cooperative };
  }

  list(): TestCooperative[] { return [...this.cooperatives.values()].map((cooperative) => ({ ...cooperative })); }

  get(id: string): TestCooperative {
    const cooperative = this.cooperatives.get(id);
    if (!cooperative) { throw new NotFoundException('Không tìm thấy HTX'); }
    return { ...cooperative };
  }

  findByManager(managerId: string): TestCooperative | undefined {
    const cooperative = [...this.cooperatives.values()].find((item) => item.manager_id === managerId);
    return cooperative ? { ...cooperative } : undefined;
  }

  lifecycle(id: string): { createdAt: number; version: number } {
    this.get(id);
    return { ...this.metadata.get(id)! };
  }

  update(id: string, changes: Partial<CreateCooperativeDto>): TestCooperative {
    const cooperative = this.get(id);
    if (changes.certificate_number !== undefined && [...this.cooperatives.values()].some((item) =>
      item.id !== id && item.certificate_number === changes.certificate_number)) {
      throw new ConflictException('HTX có số chứng nhận này đã tồn tại');
    }
    const updated = { ...cooperative, ...changes };
    this.cooperatives.set(id, updated);
    this.metadata.get(id)!.version++;
    return { ...updated };
  }

  // Service chỉ gọi sau khi đã kiểm tra Manager và các tham chiếu Farm/yêu cầu.
  removeUnmanaged(id: string): void {
    if (this.get(id).manager_id) { throw new ConflictException('Không xóa HTX đã có Manager'); }
    this.cooperatives.delete(id);
    this.metadata.delete(id);
  }

  private requireUnassignedManager(managerId: string): void {
    // Kiểm tra cả hai hướng: HTX không có hai Manager, Manager không quản lý hai HTX.
    if (this.findByManager(managerId)) { throw new ConflictException('Manager đã quản lý một HTX'); }
  }
}
