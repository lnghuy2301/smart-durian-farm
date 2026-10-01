export interface Environment {
  port: number;
  corsOrigins: string[];
  database: { postgresUrl: string; mongoUri: string; timeoutMs: number };
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
  return { port, corsOrigins, database: { postgresUrl, mongoUri, timeoutMs } };
}
