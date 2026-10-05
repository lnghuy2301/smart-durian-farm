import { ConflictException, Injectable } from '@nestjs/common';

// Chính sách dùng chung để cả sửa Zone và duyệt Farm đều giữ cùng một bất biến.
// Quy đổi decimal(7,3) thành số nguyên, tránh lỗi 0.1 + 0.2 của floating point.
@Injectable()
export class FarmAreaBudget {
  private readonly zones = new Map<string, Map<string, number>>();

  assertCapacity(farmId: string, farmArea: number, zoneId?: string, nextArea?: number): void {
    const entries = this.zones.get(farmId);
    let total = 0;
    for (const [id, area] of entries ?? []) { if (id !== zoneId) { total += area; } }
    if (nextArea !== undefined) { total += Math.round(nextArea * 1000); }
    if (total > Math.round(farmArea * 1000)) {
      throw new ConflictException('Tổng diện tích Zone vượt quá diện tích Farm');
    }
  }

  recordZone(farmId: string, zoneId: string, area: number): void {
    const entries = this.zones.get(farmId) ?? new Map<string, number>();
    entries.set(zoneId, Math.round(area * 1000));
    this.zones.set(farmId, entries);
  }
}
