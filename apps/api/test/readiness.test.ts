import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { DatabaseService, Readiness } from '../src/database/database.service';

const config = readEnvironment({
  DATABASE_URL: 'postgresql://test:secret@127.0.0.1:5432/test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
  DB_TIMEOUT_MS: '100',
});

test('readiness HTTP tracks both databases without exposing configuration; liveness stays available', async () => {
  let state: Readiness = { status: 'ok', databases: { postgres: 'up', mongodb: 'up' } };
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(DatabaseService)
    .useValue({ readiness: async () => state })
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const postgres of ['up', 'down'] as const) {
      for (const mongodb of ['up', 'down'] as const) {
        state = { status: postgres === 'up' && mongodb === 'up' ? 'ok' : 'unavailable', databases: { postgres, mongodb } };
        const response = await fetch(`${base}/api/health/ready`);
        assert.equal(response.status, state.status === 'ok' ? 200 : 503);
        const body = await response.text();
        assert.deepEqual(JSON.parse(body), state);
        assert.ok(!body.includes('secret') && !body.includes('postgresql://'));
        assert.equal((await fetch(`${base}/api/health`)).status, 200);
      }
    }
  } finally { await app.close(); }
});

test('database probes fail within configured timeout and close connections when both services are absent', async () => {
  const database = new DatabaseService({
    postgresUrl: 'postgresql://test:secret@127.0.0.1:1/test',
    mongoUri: 'mongodb://127.0.0.1:1/test',
    timeoutMs: 100,
  });
  try {
    const result = await database.readiness();
    assert.deepEqual(result, { status: 'unavailable', databases: { postgres: 'down', mongodb: 'down' } });
  } finally { await database.onApplicationShutdown(); }
});
