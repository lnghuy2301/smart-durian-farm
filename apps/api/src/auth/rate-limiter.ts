import { HttpException, HttpStatus } from '@nestjs/common';

type Action = 'login' | 'forgot' | 'register' | 'email-send' | 'email-verify';

export class WindowRateLimiter {
  private readonly buckets = new Map<Action, { startedAt: number; count: number }>();

  take(action: Action, max: number): void {
    // Khóa chỉ là các action cố định, không tạo Map vô hạn từ phone/email do client nhập.
    const now = Date.now();
    let bucket = this.buckets.get(action);
    if (!bucket || now - bucket.startedAt >= 60000) { bucket = { startedAt: now, count: 0 }; this.buckets.set(action, bucket); }
    if (++bucket.count > max) { throw new HttpException('Vui lòng thử lại sau một phút', HttpStatus.TOO_MANY_REQUESTS); }
  }
}
