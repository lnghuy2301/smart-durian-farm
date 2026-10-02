export interface OtpSms {
  phone_number: string;
  otp: string;
  expires_at: string;
}

export abstract class SmsGateway {
  abstract readonly mode: 'mock' | 'speedsms';
  abstract send(message: OtpSms): Promise<void>;
  abstract clear(): void;
  abstract messages(phoneNumber: string): OtpSms[];
}

export class MockSmsGateway extends SmsGateway {
  readonly mode = 'mock' as const;
  private message?: OtpSms;

  async send(message: OtpSms): Promise<void> { this.message = message; }
  clear(): void { this.message = undefined; }
  messages(phoneNumber: string): OtpSms[] {
    const message = this.message;
    return message && message.phone_number === phoneNumber && Date.parse(message.expires_at) > Date.now() ? [message] : [];
  }
}
