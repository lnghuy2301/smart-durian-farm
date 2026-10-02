import { normalizeVietnamPhone, SpeedSmsConfig } from '../auth/sms/speedsms.gateway';
import { normalizeTwilioPhone, TwilioVerifyConfig } from '../auth/sms/twilio-verify.gateway';
import { isEmail } from 'class-validator';
import { SmtpConfig } from '../users/email/email.sender';

export interface MockAuthConfig {
  mode: 'mock';
  phoneNumber: string;
  password: string;
  jwtSecret: string;
  sms: { provider: 'mock' } | SpeedSmsConfig | TwilioVerifyConfig;
  admin?: { phoneNumber: string; password: string };
  email?: SmtpConfig;
}

export interface Environment {
  port: number;
  corsOrigins: string[];
  database: { postgresUrl: string; mongoUri: string; timeoutMs: number };
  auth?: MockAuthConfig;
}

export function readEnvironment(env: NodeJS.ProcessEnv): Environment {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of corsOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ORIGINS must contain HTTP(S) origins without paths');
    }
  }
  const postgresUrl = env.DATABASE_URL;
  const mongoUri = env.MONGODB_URI;
  if (!postgresUrl || !/^postgres(ql)?:\/\//.test(postgresUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI');
  }
  const rawTimeout = env.DB_TIMEOUT_MS ?? '3000';
  const timeoutMs = Number(rawTimeout);
  if (!/^\d+$/.test(rawTimeout) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('DB_TIMEOUT_MS must be between 100 and 30000');
  }
  let auth: MockAuthConfig | undefined;
  const mode = env.AUTH_MODE ?? 'disabled';
  if (!['disabled', 'mock'].includes(mode)) { throw new Error('AUTH_MODE must be disabled or mock'); }
  if (mode === 'mock') {
    if (!['development', 'test'].includes(env.NODE_ENV ?? '')) {
      throw new Error('Mock Auth is allowed only in development or test');
    }
    const phoneNumber = env.AUTH_TEST_PHONE ?? '';
    const password = env.AUTH_TEST_PASSWORD ?? '';
    const jwtSecret = env.JWT_SECRET ?? '';
    if (!/^\+?\d{9,13}$/.test(phoneNumber) || phoneNumber.length > 13) { throw new Error('Invalid AUTH_TEST_PHONE'); }
    if (password.length < 8 || password.length > 128) { throw new Error('AUTH_TEST_PASSWORD must have 8 to 128 characters'); }
    if (Buffer.byteLength(jwtSecret) < 32) { throw new Error('JWT_SECRET must contain at least 32 bytes'); }
    const smsProvider = env.SMS_PROVIDER ?? 'mock';
    let sms: MockAuthConfig['sms'] = { provider: 'mock' };
    if (!['mock', 'speedsms', 'twilio'].includes(smsProvider)) { throw new Error('SMS_PROVIDER must be mock, speedsms or twilio'); }
    if (smsProvider === 'twilio') {
      const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? '';
      const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? '';
      const serviceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim() ?? '';
      const allowedPhone = env.SMS_ALLOWED_PHONE ?? '';
      if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) { throw new Error('TWILIO_ACCOUNT_SID must be an AC SID'); }
      if (!/^[0-9a-fA-F]{32}$/.test(authToken)) { throw new Error('TWILIO_AUTH_TOKEN must contain 32 hexadecimal characters'); }
      if (!/^VA[0-9a-fA-F]{32}$/.test(serviceSid)) { throw new Error('TWILIO_VERIFY_SERVICE_SID must be a VA SID'); }
      if (normalizeTwilioPhone(allowedPhone) !== normalizeTwilioPhone(phoneNumber)) { throw new Error('SMS_ALLOWED_PHONE must match AUTH_TEST_PHONE'); }
      const rawSmsTimeout = env.SMS_TIMEOUT_MS ?? '10000';
      const timeoutMs = Number(rawSmsTimeout);
      if (!/^\d+$/.test(rawSmsTimeout) || timeoutMs < 100 || timeoutMs > 30000) { throw new Error('SMS_TIMEOUT_MS must be between 100 and 30000'); }
      if (!['true', 'false'].includes(env.LIVE_SMS_ENABLED ?? 'false')) { throw new Error('LIVE_SMS_ENABLED must be true or false'); }
      sms = { provider: 'twilio', accountSid, authToken, serviceSid, allowedPhone, timeoutMs, liveEnabled: env.LIVE_SMS_ENABLED === 'true' };
    }
    if (smsProvider === 'speedsms') {
      const accessToken = env.SPEEDSMS_ACCESS_TOKEN?.trim() ?? '';
      const allowedPhone = env.SMS_ALLOWED_PHONE ?? '';
      const rawType = env.SPEEDSMS_SMS_TYPE ?? '4';
      const sender = env.SPEEDSMS_SENDER ?? 'Verify';
      const rawSmsTimeout = env.SMS_TIMEOUT_MS ?? '10000';
      if (!accessToken) { throw new Error('SPEEDSMS_ACCESS_TOKEN is required'); }
      if (normalizeVietnamPhone(allowedPhone) !== normalizeVietnamPhone(phoneNumber)) { throw new Error('SMS_ALLOWED_PHONE must match AUTH_TEST_PHONE'); }
      if (!['2', '4'].includes(rawType)) { throw new Error('SPEEDSMS_SMS_TYPE must be 2 or 4'); }
      if (rawType === '4' && !['Verify', 'Notify'].includes(sender)) { throw new Error('Use an approved Verify or Notify sender'); }
      if (rawType === '2' && sender !== '') { throw new Error('Type 2 requires an empty sender'); }
      const timeoutMs = Number(rawSmsTimeout);
      if (!/^\d+$/.test(rawSmsTimeout) || timeoutMs < 100 || timeoutMs > 30000) { throw new Error('SMS_TIMEOUT_MS must be between 100 and 30000'); }
      if (!['true', 'false'].includes(env.LIVE_SMS_ENABLED ?? 'false')) { throw new Error('LIVE_SMS_ENABLED must be true or false'); }
      sms = { provider: 'speedsms', accessToken, allowedPhone, smsType: Number(rawType) as 2 | 4, sender,
        liveEnabled: env.LIVE_SMS_ENABLED === 'true', timeoutMs };
    }
    const adminPhone = env.AUTH_TEST_ADMIN_PHONE ?? '';
    const adminPassword = env.AUTH_TEST_ADMIN_PASSWORD ?? '';
    let admin: MockAuthConfig['admin'];
    if (adminPhone || adminPassword) {
      if (!/^\+?\d{9,13}$/.test(adminPhone) || adminPhone.length > 13 || adminPassword.length < 8 || adminPassword.length > 128) {
        throw new Error('Configure both valid AUTH_TEST_ADMIN_PHONE and AUTH_TEST_ADMIN_PASSWORD');
      }
      const phoneKey = (phone: string) => phone.replace(/^\+/, '').replace(/^0(?=\d{9}$)/, '84');
      if (phoneKey(adminPhone) === phoneKey(phoneNumber)) { throw new Error('Test Admin and Farmer must have different phone numbers'); }
      admin = { phoneNumber: adminPhone, password: adminPassword };
    }
    const emailProvider = env.EMAIL_PROVIDER ?? 'disabled';
    if (!['disabled', 'smtp'].includes(emailProvider)) { throw new Error('EMAIL_PROVIDER must be disabled or smtp'); }
    let email: SmtpConfig | undefined;
    if (emailProvider === 'smtp') {
      const host = env.SMTP_HOST?.trim() ?? '';
      const user = env.SMTP_USER?.trim() ?? '';
      const smtpPassword = env.SMTP_PASSWORD ?? '';
      const from = env.SMTP_FROM?.trim() ?? '';
      const rawSmtpPort = env.SMTP_PORT ?? '465';
      const smtpPort = Number(rawSmtpPort);
      const rawSecure = env.SMTP_SECURE ?? 'true';
      const rawSmtpTimeout = env.SMTP_TIMEOUT_MS ?? '10000';
      const smtpTimeout = Number(rawSmtpTimeout);
      if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !user || !smtpPassword || !isEmail(from) || from.length > 255) { throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD and valid SMTP_FROM are required'); }
      if (!/^\d+$/.test(rawSmtpPort) || smtpPort < 1 || smtpPort > 65535) { throw new Error('Invalid SMTP_PORT'); }
      if (!['true', 'false'].includes(rawSecure)) { throw new Error('SMTP_SECURE must be true or false'); }
      if (smtpPort === 465 && rawSecure !== 'true' || smtpPort === 587 && rawSecure !== 'false') { throw new Error('Use secure=true for SMTP 465 or secure=false (STARTTLS) for 587'); }
      if (!/^\d+$/.test(rawSmtpTimeout) || smtpTimeout < 100 || smtpTimeout > 30000) { throw new Error('SMTP_TIMEOUT_MS must be between 100 and 30000'); }
      email = { provider: 'smtp', host, port: smtpPort, secure: rawSecure === 'true', user, password: smtpPassword, from, timeoutMs: smtpTimeout };
    }
    auth = { mode: 'mock', phoneNumber, password, jwtSecret, sms, admin, email };
  }
  return { port, corsOrigins, database: { postgresUrl, mongoUri, timeoutMs }, auth };
}
