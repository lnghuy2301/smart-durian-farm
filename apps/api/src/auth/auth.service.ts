import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MockUserStore } from './mock-user.store';
import { hashPassword, verifyPassword } from './password';
import { OtpProof, OtpProvider } from './sms/otp.provider';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const TOKEN_TTL_SECONDS = 15 * 60;

interface OtpChallenge { proof: OtpProof; expiresAt: number; attempts: number; consumed: boolean }

@Injectable()
export class AuthService {
  private challenge?: OtpChallenge;
  private nextSendAt = 0;
  private otpBusy = false;
  private readonly rateLimits = new Map<string, { startedAt: number; count: number }>();

  constructor(@Inject(MockUserStore) private readonly store: MockUserStore,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(OtpProvider) private readonly otpProvider: OtpProvider) {}

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
    if (!this.otpBusy && phoneNumber === this.store.user.phone_number && this.store.user.status === 'Active' && now >= this.nextSendAt) {
      // Giữ cooldown trước await để request đồng thời không gửi hai SMS bị tính phí.
      this.nextSendAt = now + RESEND_DELAY_MS;
      this.challenge = undefined;
      this.otpProvider.clear();
      this.otpBusy = true;
      try {
        const proof = await this.otpProvider.issue(phoneNumber, now + OTP_TTL_MS);
        // Chỉ kích hoạt OTP sau khi provider nhận yêu cầu; không khẳng định điện thoại đã nhận SMS.
        this.challenge = { proof, expiresAt: now + OTP_TTL_MS, attempts: 0, consumed: false };
      } finally { this.otpBusy = false; }
    }
    // Cùng response cho tài khoản có/không tồn tại; không trả OTP hoặc SID ra client.
    return { message: 'Nếu tài khoản hợp lệ, mã OTP đã được gửi', expires_in: OTP_TTL_MS / 1000 };
  }

  async resetPassword(phoneNumber: string, otp: string, newPassword: string) {
    const challenge = this.challenge;
    if (this.otpBusy || !challenge || challenge.consumed || Date.now() >= challenge.expiresAt || challenge.attempts >= MAX_OTP_ATTEMPTS ||
        phoneNumber !== this.store.user.phone_number || this.store.user.status !== 'Active') {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
    }
    challenge.attempts++;
    // Khóa cả gửi lại và reset trong lúc chờ Verify/hash; không để hai request cùng đổi mật khẩu.
    this.otpBusy = true;
    try {
      let matches: boolean;
      try { matches = await this.otpProvider.verify(challenge.proof, otp); }
      catch (error) {
        // Timeout có thể xảy ra sau khi Twilio đã dùng mã. Hủy challenge để không tái sử dụng mơ hồ.
        challenge.consumed = true;
        this.otpProvider.clear();
        throw error;
      }
      if (!matches || Date.now() >= challenge.expiresAt || this.store.user.status !== 'Active') {
        throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
      }
      // Đánh dấu dùng trước await hash: mã đã được xác minh không thể dùng thêm lần nữa.
      challenge.consumed = true;
      this.otpProvider.clear();
      this.store.user.password = await hashPassword(newPassword);
      this.store.version++; // Thu hồi token cũ; version chỉ nằm trong bộ nhớ test.
      return { message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại' };
    } finally { this.otpBusy = false; }
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
    if (this.otpProvider.mode !== 'mock') { throw new NotFoundException(); }
    return { mode: 'mock', messages: this.otpProvider.messages(phoneNumber) };
  }
}
