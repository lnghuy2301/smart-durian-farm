import { HttpException, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OtpProof, OtpProvider } from './otp.provider';

export interface TwilioVerifyConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  serviceSid: string;
  allowedPhone: string;
  allowedPhones?: string[];
  liveEnabled: boolean;
  timeoutMs: number;
}

export function normalizeTwilioPhone(phone: string): string {
  const digits = phone.replace(/^\+/, '').replace(/^0/, '84');
  if (!/^84[35789]\d{8}$/.test(digits)) { throw new Error('Expected a Vietnamese mobile number'); }
  return `+${digits}`;
}

type Payload = Record<string, unknown>;
interface ProviderReply { response: Response; data: Payload }

export class TwilioVerifyGateway extends OtpProvider {
  readonly mode = 'twilio' as const;
  private readonly logger = new Logger(TwilioVerifyGateway.name);

  constructor(private readonly config: TwilioVerifyConfig, private readonly fetcher: typeof fetch = fetch) { super(); }

  async issue(phone: string): Promise<OtpProof> {
    const to = this.requireAllowedPhone(phone);
    // Đọc cấu hình trước khi gửi để tránh tốn SMS cho mã 4 chữ số mà DTO chỉ nhận 6.
    const service = await this.request('', 'GET');
    this.requireSuccess(service);
    if (service.data.sid !== this.config.serviceSid || service.data.account_sid !== this.config.accountSid || service.data.code_length !== 6) {
      throw new ServiceUnavailableException('Kiểm tra Verify Service SID và đặt Code length = 6 trong Twilio');
    }
    const reply = await this.request('/Verifications', 'POST', { To: to, Channel: 'sms' });
    this.requireSuccess(reply);
    this.requireIdentity(reply.data, to);
    if (reply.data.status !== 'pending' || typeof reply.data.sid !== 'string' || !/^VE[0-9a-fA-F]{32}$/.test(reply.data.sid)) {
      throw this.unavailable();
    }
    // Không sinh/lưu mã OTP tại backend khi dùng Verify. Chỉ giữ SID của lần gửi được chấp nhận.
    return { kind: 'twilio', verificationSid: reply.data.sid, phone: to };
  }

  async verify(proof: OtpProof, code: string): Promise<boolean> {
    if (proof.kind !== 'twilio' || !/^VE[0-9a-fA-F]{32}$/.test(proof.verificationSid) || !/^\d{6}$/.test(code)) { return false; }
    const to = this.requireAllowedPhone(proof.phone);
    // Dùng SID cụ thể, không chỉ To: mã của một challenge khác không được đổi mật khẩu.
    const reply = await this.request('/VerificationCheck', 'POST', { VerificationSid: proof.verificationSid, Code: code });
    if (reply.response.status === 404 || reply.data.code === 60202) { return false; }
    this.requireSuccess(reply);
    this.requireIdentity(reply.data, to);
    if (reply.data.sid !== proof.verificationSid) { throw this.unavailable(); }
    if (reply.data.status === 'approved') { return true; }
    if (['pending', 'expired', 'canceled', 'deleted', 'failed', 'max_attempts_reached'].includes(String(reply.data.status))) { return false; }
    throw this.unavailable();
  }

  clear(): void { /* Trạng thái OTP nằm ở Twilio; Auth sẽ loại bỏ challenge trong bộ nhớ. */ }
  messages(): [] { return []; }

  private requireAllowedPhone(phone: string): string {
    if (!this.config.liveEnabled) { throw new ServiceUnavailableException('Bật LIVE_SMS_ENABLED=true để dùng Twilio Verify'); }
    const to = normalizeTwilioPhone(phone);
    const allowed = [this.config.allowedPhone, ...(this.config.allowedPhones ?? [])].map(normalizeTwilioPhone);
    if (!allowed.includes(to)) { throw new ServiceUnavailableException('Số nhận SMS không nằm trong danh sách demo'); }
    return to;
  }

  private requireIdentity(data: Payload, phone: string): void {
    if (data.account_sid !== this.config.accountSid || data.service_sid !== this.config.serviceSid || data.to !== phone || data.channel !== 'sms') {
      throw this.unavailable();
    }
  }

  private async request(path: string, method: 'GET' | 'POST', form?: Record<string, string>): Promise<ProviderReply> {
    try {
      const response = await this.fetcher(`https://verify.twilio.com/v2/Services/${this.config.serviceSid}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) { throw new Error('Invalid provider response'); }
      return { response, data: data as Payload };
    } catch {
      // Không log exception/body gốc: có thể chứa token, số điện thoại hoặc OTP.
      this.logger.warn('Twilio Verify network/JSON failure; no automatic retry');
      throw this.unavailable();
    }
  }

  private requireSuccess({ response, data }: ProviderReply): void {
    if (response.ok) { return; }
    const code = typeof data.code === 'number' && Number.isInteger(data.code) ? data.code : 'unknown';
    this.logger.warn(`Twilio Verify rejected request: HTTP ${response.status}, code ${code}`);
    if (response.status === 429) { throw new HttpException('Twilio đang giới hạn yêu cầu. Vui lòng thử lại sau', HttpStatus.TOO_MANY_REQUESTS); }
    throw this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('Không thể xác nhận OTP với Twilio. Kiểm tra Verify Logs và cấu hình');
  }
}
