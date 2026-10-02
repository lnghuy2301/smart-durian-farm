import { Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

export interface SmtpConfig {
  provider: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  timeoutMs: number;
}

export abstract class EmailSender {
  abstract sendVerification(to: string, code: string): Promise<void>;
}

export class DisabledEmailSender extends EmailSender {
  async sendVerification(): Promise<void> {
    throw new ServiceUnavailableException('Chưa cấu hình email. Điền SMTP trong .env và bật EMAIL_PROVIDER=smtp');
  }
}

export class SmtpEmailSender extends EmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig, transport?: Transporter) {
    super();
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Cổng 587 khởi đầu bằng SMTP rồi nâng cấp STARTTLS; không gửi khi nâng cấp thất bại.
      requireTLS: !config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
      dnsTimeout: config.timeoutMs,
      tls: { minVersion: 'TLSv1.2' },
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }

  async sendVerification(to: string, code: string): Promise<void> {
    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to,
        subject: 'Smart Durian Farm - Xác minh email',
        text: `Mã xác minh email của bạn là: ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, vui lòng bỏ qua email này.`,
      });
      if (!Array.isArray(info.accepted) || !info.accepted.includes(to) || (info.rejected?.length ?? 0) > 0) {
        throw new Error('Recipient not accepted');
      }
    } catch {
      // Không log lỗi SMTP gốc: có thể chứa credentials, địa chỉ nhận hoặc OTP.
      this.logger.warn('SMTP verification email failed; no automatic retry');
      throw new ServiceUnavailableException('Không thể gửi email xác minh. Kiểm tra cấu hình SMTP rồi thử lại');
    }
  }
}
