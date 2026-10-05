import { BadRequestException } from '@nestjs/common';

const DAY_MS = 86400000;
export const HARVEST_BACKDATE_DAYS = 7;

export function vietnamToday(now = Date.now()): string {
  return new Date(now + 7 * 3600000).toISOString().slice(0, 10);
}

export function validateHarvestDate(value: string, now = Date.now()): number {
  // Date.parse tự sửa 30/02; so sánh lại ngày để không chấp nhận ngày không tồn tại.
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  if (!Number.isFinite(parsed) || value.startsWith('0000') || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('harvest_date phải là ngày YYYY-MM-DD hợp lệ');
  }
  const days = (Date.parse(`${vietnamToday(now)}T00:00:00Z`) - parsed) / DAY_MS;
  if (days < 0) { throw new BadRequestException('Không nhập ngày thu hoạch tương lai'); }
  return days;
}
