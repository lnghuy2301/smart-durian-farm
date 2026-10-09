import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { MockUserStore, normalizeEmail, TestUser } from '../../auth/mock-user.store';
import { WindowRateLimiter } from '../../auth/rate-limiter';
import { EmailSender } from './email.sender';
import { VerifyRegistrationEmailDto } from '../users.dto';

const TTL_MS = 10 * 60 * 1000;
interface EmailChallenge {
  id: string;
  phone: string;
  email: string;
  salt: string;
  digest: Buffer;
  expiresAt: number;
  nextSendAt: number;
  attempts: number;
  state: 'sending' | 'sent' | 'verified' | 'consumed' | 'failed';
  tokenDigest?: Buffer;
}

@Injectable()
export class EmailVerificationService {
  private readonly challenges = new Map<string, EmailChallenge>();
  private readonly limiter = new WindowRateLimiter();

  constructor(
    @Inject(EmailSender) private readonly sender: EmailSender,
    @Inject(MockUserStore) private readonly store: MockUserStore,
  ) {}

  async request(phone: string, gmail: string) {
    this.limiter.take('email-send', 5);
    const email = normalizeEmail(gmail);
    this.store.assertAvailable(phone, email);
    const now = Date.now();
    for (const [key, challenge] of this.challenges) {
      if (challenge.expiresAt <= now && challenge.state !== 'sending') { this.challenges.delete(key); }
    }
    const previous = this.challenges.get(email);
    if (previous && (previous.state === 'sending' || now < previous.nextSendAt)) {
      throw new HttpException('Đợi 60 giây trước khi gửi lại email', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!previous && this.challenges.size >= 100) { throw new HttpException('Quá nhiều yêu cầu xác minh; thử lại sau', HttpStatus.TOO_MANY_REQUESTS); }
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const challenge: EmailChallenge = {
      id: randomUUID(), phone, email, salt,
      digest: this.digest(`${salt}:${code}`),
      expiresAt: now + TTL_MS,
      nextSendAt: now + 60000,
      attempts: 0,
      state: 'sending',
    };
    // Đặt trạng thái trước await để request đồng thời không gửi hai email hoặc dùng mã chưa gửi.
    this.challenges.set(email, challenge);
    try {
      await this.sender.sendVerification(email, code);
      challenge.state = 'sent';
    } catch (error) {
      challenge.state = 'failed';
      throw error;
    }
    return {
      message: 'Yêu cầu gửi email xác minh đã được chấp nhận',
      verification_id: challenge.id,
      expires_in: Math.max(0, Math.floor((challenge.expiresAt - Date.now()) / 1000)),
    };
  }

  verify(input: VerifyRegistrationEmailDto) {
    this.limiter.take('email-verify', 20);
    const challenge = this.challenges.get(normalizeEmail(input.gmail));
    if (!challenge || challenge.id !== input.verification_id || challenge.phone !== input.phone_number ||
      challenge.state !== 'sent' || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
      throw this.invalid();
    }
    challenge.attempts++;
    if (!timingSafeEqual(challenge.digest, this.digest(`${challenge.salt}:${input.otp}`))) { throw this.invalid(); }
    const token = randomUUID();
    challenge.state = 'verified';
    challenge.tokenDigest = this.digest(token);
    return {
      message: 'Email đã được xác minh; tiếp tục đăng ký tài khoản',
      email_verification_token: token,
      expires_in: Math.max(0, Math.floor((challenge.expiresAt - Date.now()) / 1000)),
    };
  }

  requireProof(phone: string, gmail: string, token: string): EmailChallenge {
    const challenge = this.challenges.get(normalizeEmail(gmail));
    if (!challenge || challenge.phone !== phone || challenge.state !== 'verified' || challenge.expiresAt <= Date.now() ||
      !challenge.tokenDigest || !timingSafeEqual(challenge.tokenDigest, this.digest(token))) {
      throw this.invalid();
    }
    return challenge;
  }

  consume(phone: string, gmail: string, token: string): void {
    this.requireProof(phone, gmail, token).state = 'consumed';
  }

  consumeForRegistration(phone: string, gmail: string, token: string, createAccount: () => TestUser): TestUser {
    const challenge = this.requireProof(phone, gmail, token);
    // Chốt proof còn hạn trước khi ghi. Cả khối phải đồng bộ, không await hoặc kiểm tra hạn lần nữa
    // sau khi đã tạo user: tránh trả 400 nhưng tài khoản vẫn tồn tại khi clock vượt deadline.
    // Nếu createAccount bị từ chối (trùng email/phone hoặc đầy store), proof vẫn chưa bị dùng.
    const user = createAccount();
    challenge.state = 'consumed';
    return user;
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }

  private invalid(): BadRequestException {
    return new BadRequestException('Xác minh email không hợp lệ, đã dùng hoặc hết hạn');
  }
}
