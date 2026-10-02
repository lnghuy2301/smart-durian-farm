import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { MockUserStore } from './mock-user.store';
import { hashPassword, verifyPassword } from './password';
import { SmsGateway } from './sms/sms.gateway';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const TOKEN_TTL_SECONDS = 15 * 60;

interface OtpChallenge { digest: Buffer; expiresAt: number; attempts: number; consumed: boolean }

@Injectable()
export class AuthService {
  private challenge?: OtpChallenge;
  private nextSendAt = 0;
  private readonly rateLimits = new Map<string, { startedAt: number; count: number }>();

  constructor(@Inject(MockUserStore) private readonly store: MockUserStore,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SmsGateway) private readonly smsGateway: SmsGateway) {}

  private rateLimit(action: 'login' | 'forgot', max: number): void {
    // Chế độ test chỉ có một tài khoản; bucket cố định tránh tạo Map vô hạn theo số điện thoại lạ.
    const now = Date.now();
    let bucket = this.rateLimits.get(action);
    if (!bucket || now - bucket.startedAt >= 60000) { bucket = { startedAt: now, count: 0 }; this.rateLimits.set(action, bucket); }
    if (++bucket.count > max) { throw new HttpException('Vui lòng thử lại sau một phút', HttpStatus.TOO_MANY_REQUESTS); }
  }

  async login(phoneNumber: string, password: string) {
    this.rateLimit('login', 20);
    const version = this.store.version;
    // Luôn verify một hash hợp lệ, kể cả số điện thoại sai, để giảm chênh lệch thời gian phản hồi.
    const matches = await verifyPassword(password, this.store.user.password);
    if (!matches || version !== this.store.version || phoneNumber !== this.store.user.phone_number || this.store.user.status !== 'Active') {
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }
    return {
      access_token: await this.jwt.signAsync({ sub: this.store.user.id, version }, { expiresIn: TOKEN_TTL_SECONDS }),
      token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS, user: this.store.publicUser(),
    };
  }

  async forgotPassword(phoneNumber: string) {
    this.rateLimit('forgot', 5);
    const now = Date.now();
    if (phoneNumber === this.store.user.phone_number && this.store.user.status === 'Active' && now >= this.nextSendAt) {
      const otp = randomInt(0, 1000000).toString().padStart(6, '0');
      // Giữ cooldown trước await để request đồng thời không gửi hai SMS bị tính phí.
      this.nextSendAt = now + RESEND_DELAY_MS;
      this.challenge = undefined;
      this.smsGateway.clear();
      await this.smsGateway.send({ phone_number: phoneNumber, otp, expires_at: new Date(now + OTP_TTL_MS).toISOString() });
      // Chỉ kích hoạt OTP sau khi provider xác nhận nhận yêu cầu; không khẳng định điện thoại đã nhận SMS.
      this.challenge = { digest: this.otpDigest(otp), expiresAt: now + OTP_TTL_MS, attempts: 0, consumed: false };
    }
    // Cùng response cho tài khoản có/không tồn tại. OTP chỉ ở hộp thư SMS giả lập local, không trong response này.
    return { message: 'Nếu tài khoản hợp lệ, mã OTP đã được gửi', expires_in: OTP_TTL_MS / 1000 };
  }

  async resetPassword(phoneNumber: string, otp: string, newPassword: string) {
    const challenge = this.challenge;
    if (!challenge || challenge.consumed || Date.now() >= challenge.expiresAt || challenge.attempts >= MAX_OTP_ATTEMPTS ||
        phoneNumber !== this.store.user.phone_number || this.store.user.status !== 'Active') {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
    }
    challenge.attempts++;
    if (!timingSafeEqual(challenge.digest, this.otpDigest(otp))) { throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn'); }
    // Đánh dấu dùng ngay trước await: hai request song song không thể dùng cùng OTP để đổi hai mật khẩu.
    challenge.consumed = true;
    this.smsGateway.clear();
    this.store.user.password = await hashPassword(newPassword);
    this.store.version++; // Thu hồi token cũ sau khi đổi mật khẩu; version chỉ nằm trong bộ nhớ test.
    return { message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại' };
  }

  async authenticate(token: string) {
    let payload: { sub?: string; version?: number };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn'); }
    if (payload.sub !== this.store.user.id || payload.version !== this.store.version || this.store.user.status !== 'Active') {
      throw new UnauthorizedException('Token không còn hợp lệ');
    }
    return this.store.publicUser();
  }

  testSms(phoneNumber: string) {
    if (this.smsGateway.mode !== 'mock') { throw new NotFoundException(); }
    return { mode: 'mock', messages: this.smsGateway.messages(phoneNumber) };
  }

  private otpDigest(otp: string): Buffer {
    return createHash('sha256').update(`${this.store.user.id}:${otp}`).digest();
  }
}
