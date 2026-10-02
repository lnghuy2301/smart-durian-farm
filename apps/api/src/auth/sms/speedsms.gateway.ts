import { ServiceUnavailableException } from '@nestjs/common';
import { OtpSms, SmsGateway } from './sms.gateway';

export interface SpeedSmsConfig {
  provider: 'speedsms';
  accessToken: string;
  smsType: 2 | 4;
  sender: string;
  allowedPhone: string;
  liveEnabled: boolean;
  timeoutMs: number;
}

export function normalizeVietnamPhone(phone: string): string {
  const normalized = phone.startsWith('+') ? phone.slice(1) : phone.startsWith('0') ? `84${phone.slice(1)}` : phone;
  if (!/^84\d{9}$/.test(normalized)) { throw new Error('Expected a Vietnamese mobile number'); }
  return normalized;
}

export class SpeedSmsGateway extends SmsGateway {
  readonly mode = 'speedsms' as const;

  constructor(private readonly config: SpeedSmsConfig, private readonly fetcher: typeof fetch = fetch) { super(); }

  async send(message: OtpSms): Promise<void> {
    // Chỉ gửi tới số demo đã cho phép; không để API test biến thành cổng gửi SMS tùy ý.
    if (!this.config.liveEnabled || normalizeVietnamPhone(message.phone_number) !== normalizeVietnamPhone(this.config.allowedPhone)) {
      throw new ServiceUnavailableException('Gửi SMS thật chưa được bật hoặc số nhận chưa được cho phép');
    }
    try {
      const response = await this.fetcher('https://api.speedsms.vn/index.php/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.config.accessToken}:x`).toString('base64')}`,
        },
        body: JSON.stringify({
          to: [normalizeVietnamPhone(message.phone_number)],
          content: `Smart Durian Farm: Ma OTP dat lai mat khau la ${message.otp}. Hieu luc 5 phut. Khong chia se ma nay.`,
          sms_type: this.config.smsType,
          sender: this.config.sender,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      // HTTP 200 chưa đủ: SpeedSMS có thể báo lỗi API trong JSON, hoặc từ chối số nhận.
      const payload: unknown = await response.json();
      if (!response.ok || !this.isAccepted(payload)) { throw new Error('SMS not accepted'); }
    } catch {
      // Không trả raw response/token/OTP ra client. Không retry tự động vì timeout có thể đã bị trừ tiền.
      throw new ServiceUnavailableException('Không thể xác nhận gửi SMS. Kiểm tra tài khoản SpeedSMS và thử lại sau');
    }
  }

  private isAccepted(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') { return false; }
    const body = payload as Record<string, unknown>;
    if (body.status !== 'success' || body.code !== '00' || !body.data || typeof body.data !== 'object') { return false; }
    const data = body.data as Record<string, unknown>;
    return typeof data.totalSMS === 'number' && data.totalSMS > 0 &&
      Array.isArray(data.invalidPhone) && data.invalidPhone.length === 0;
  }

  // Không giữ mã OTP dạng rõ khi gửi thật; endpoint SMS giả không được đọc OTP này.
  clear(): void {}
  messages(): OtpSms[] { return []; }
}
