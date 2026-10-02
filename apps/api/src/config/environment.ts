import { normalizeVietnamPhone, SpeedSmsConfig } from '../auth/sms/speedsms.gateway';

export interface MockAuthConfig {
  mode: 'mock';
  phoneNumber: string;
  password: string;
  jwtSecret: string;
  sms: { provider: 'mock' } | SpeedSmsConfig;
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
    if (!['mock', 'speedsms'].includes(smsProvider)) { throw new Error('SMS_PROVIDER must be mock or speedsms'); }
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
    auth = { mode: 'mock', phoneNumber, password, jwtSecret, sms };
  }
  return { port, corsOrigins, database: { postgresUrl, mongoUri, timeoutMs }, auth };
}
