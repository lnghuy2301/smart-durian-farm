import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MockUserStore } from './mock-user.store';
import { hashPassword, verifyPassword } from './password';
import { OtpProof, OtpProvider } from './sms/otp.provider';
import { WindowRateLimiter } from './rate-limiter';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const TOKEN_TTL_SECONDS = 15 * 60;

interface OtpChallenge { proof: OtpProof; expiresAt: number; attempts: number; consumed: boolean }
interface OtpState { challenge?: OtpChallenge; nextSendAt: number; busy: boolean }

@Injectable()
export class AuthService {
  private readonly otpStates = new Map<string, OtpState>();
  private readonly rateLimits = new WindowRateLimiter();

  constructor(@Inject(MockUserStore) private readonly store: MockUserStore,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(OtpProvider) private readonly otpProvider: OtpProvider) {}

  async login(phoneNumber: string, password: string) {
    this.rateLimits.take('login', 20);
    const user = this.store.findByPhone(phoneNumber);
    const version = user ? this.store.versionOf(user.id) : 0;
    // Luôn verify một hash hợp lệ, kể cả số điện thoại sai, để giảm chênh lệch thời gian phản hồi.
    const matches = await verifyPassword(password, user?.password ?? this.store.user.password);
    if (!matches || !user || version !== this.store.versionOf(user.id) || user.status === 'Locked') {
      throw new UnauthorizedException('Số điện thoại hoặc mật khẩu không đúng');
    }
    if (user.status !== 'Active') { throw new ForbiddenException('Tài khoản chưa được duyệt hoặc đã bị từ chối'); }
    return {
      access_token: await this.jwt.signAsync({ sub: user.id, version }, { expiresIn: TOKEN_TTL_SECONDS }),
      token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS, user: this.store.publicUser(user),
    };
  }

  async forgotPassword(phoneNumber: string) {
    this.rateLimits.take('forgot', 5);
    const now = Date.now();
    const user = this.store.findByPhone(phoneNumber);
    const state = user?.status === 'Active' ? this.stateFor(user.id) : undefined;
    if (state && !state.busy && now >= state.nextSendAt) {
      // Giữ cooldown trước await để request đồng thời không gửi hai SMS bị tính phí.
      state.nextSendAt = now + RESEND_DELAY_MS;
      state.challenge = undefined;
      this.otpProvider.clear(phoneNumber);
      state.busy = true;
      try {
        const proof = await this.otpProvider.issue(phoneNumber, now + OTP_TTL_MS);
        // Chỉ kích hoạt OTP sau khi provider nhận yêu cầu; không khẳng định điện thoại đã nhận SMS.
        state.challenge = { proof, expiresAt: now + OTP_TTL_MS, attempts: 0, consumed: false };
      } finally { state.busy = false; }
    }
    // Cùng response cho tài khoản có/không tồn tại; không trả OTP hoặc SID ra client.
    return { message: 'Nếu tài khoản hợp lệ, mã OTP đã được gửi', expires_in: OTP_TTL_MS / 1000 };
  }

  async resetPassword(phoneNumber: string, otp: string, newPassword: string) {
    const user = this.store.findByPhone(phoneNumber);
    const state = user ? this.otpStates.get(user.id) : undefined;
    const challenge = state?.challenge;
    if (!user || !state || state.busy || !challenge || challenge.consumed || Date.now() >= challenge.expiresAt || challenge.attempts >= MAX_OTP_ATTEMPTS ||
        user.status !== 'Active') {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
    }
    challenge.attempts++;
    // Khóa cả gửi lại và reset trong lúc chờ Verify/hash; không để hai request cùng đổi mật khẩu.
    state.busy = true;
    try {
      let matches: boolean;
      try { matches = await this.otpProvider.verify(challenge.proof, otp); }
      catch (error) {
        // Timeout có thể xảy ra sau khi Twilio đã dùng mã. Hủy challenge để không tái sử dụng mơ hồ.
        challenge.consumed = true;
        this.otpProvider.clear(phoneNumber);
        throw error;
      }
      if (!matches || Date.now() >= challenge.expiresAt || user.status !== 'Active') {
        throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
      }
      // Đánh dấu dùng trước await hash: mã đã được xác minh không thể dùng thêm lần nữa.
      challenge.consumed = true;
      this.otpProvider.clear(phoneNumber);
      const passwordHash = await hashPassword(newPassword);
      if (user.status !== 'Active') { throw new BadRequestException('Tài khoản không còn hoạt động'); }
      user.password = passwordHash;
      this.store.revokeTokens(user.id); // Chỉ thu hồi token của user đổi mật khẩu.
      return { message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại' };
    } finally { state.busy = false; }
  }

  async authenticate(token: string) {
    let payload: { sub?: string; version?: number };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn'); }
    const user = typeof payload.sub === 'string' ? this.store.findById(payload.sub) : undefined;
    if (!user || payload.version !== this.store.versionOf(user.id) || user.status !== 'Active') {
      throw new UnauthorizedException('Token không còn hợp lệ');
    }
    return this.store.publicUser(user);
  }

  testSms(phoneNumber: string) {
    if (this.otpProvider.mode !== 'mock') { throw new NotFoundException(); }
    return { mode: 'mock', messages: this.otpProvider.messages(phoneNumber) };
  }

  private stateFor(userId: string): OtpState {
    let state = this.otpStates.get(userId);
    if (!state) { state = { nextSendAt: 0, busy: false }; this.otpStates.set(userId, state); }
    return state;
  }
}
