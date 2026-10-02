export interface MockAuthConfig {
  mode: 'mock';
  phoneNumber: string;
  password: string;
  jwtSecret: string;
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
    auth = { mode: 'mock', phoneNumber, password, jwtSecret };
  }
  return { port, corsOrigins, database: { postgresUrl, mongoUri, timeoutMs }, auth };
}
