import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { OtpSms, SmsGateway } from './sms.gateway';

export type OtpProof =
  | { kind: 'local'; salt: string; digest: Buffer }
  | { kind: 'twilio'; verificationSid: string; phone: string };

// Auth quản lý hạn dùng/số lần thử; provider quyết định cách tạo và xác minh mã.
export abstract class OtpProvider {
  abstract readonly mode: 'mock' | 'speedsms' | 'twilio';
  abstract issue(phone: string, expiresAt: number): Promise<OtpProof>;
  abstract verify(proof: OtpProof, code: string): Promise<boolean>;
  abstract clear(): void;
  abstract messages(phone: string): OtpSms[];
}

export class LocalOtpProvider extends OtpProvider {
  get mode() { return this.sms.mode; }
  constructor(private readonly sms: SmsGateway) { super(); }

  async issue(phone: string, expiresAt: number): Promise<OtpProof> {
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    await this.sms.send({ phone_number: phone, otp: code, expires_at: new Date(expiresAt).toISOString() });
    return { kind: 'local', salt, digest: this.digest(salt, code) };
  }

  async verify(proof: OtpProof, code: string): Promise<boolean> {
    return proof.kind === 'local' && timingSafeEqual(proof.digest, this.digest(proof.salt, code));
  }

  clear(): void { this.sms.clear(); }
  messages(phone: string): OtpSms[] { return this.sms.messages(phone); }
  private digest(salt: string, code: string): Buffer {
    return createHash('sha256').update(`${salt}:${code}`).digest();
  }
}
