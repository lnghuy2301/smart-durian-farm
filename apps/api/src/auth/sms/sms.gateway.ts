export interface OtpSms {
  phone_number: string;
  otp: string;
  expires_at: string;
}

export abstract class SmsGateway {
  abstract readonly mode: 'mock' | 'speedsms';
  abstract send(message: OtpSms): Promise<void>;
  abstract clear(phoneNumber?: string): void;
  abstract messages(phoneNumber: string): OtpSms[];
}

export class MockSmsGateway extends SmsGateway {
  readonly mode = 'mock' as const;
  private readonly outbox = new Map<string, OtpSms>();

  async send(message: OtpSms): Promise<void> { this.outbox.set(message.phone_number, message); }
  clear(phoneNumber?: string): void {
    if (phoneNumber === undefined) { this.outbox.clear(); }
    else { this.outbox.delete(phoneNumber); }
  }
  messages(phoneNumber: string): OtpSms[] {
    const message = this.outbox.get(phoneNumber);
    return message && message.phone_number === phoneNumber && Date.parse(message.expires_at) > Date.now() ? [message] : [];
  }
}
