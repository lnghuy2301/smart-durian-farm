import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';

const databaseEnv = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
};

test('rejects invalid ports and unsafe CORS configuration', () => {
  for (const PORT of ['0', '65536', '3000.5', 'abc', '']) {
    assert.throws(() => readEnvironment({ ...databaseEnv, PORT }));
  }
  assert.throws(() => readEnvironment({ ...databaseEnv, CORS_ORIGINS: '*' }));
  assert.throws(() => readEnvironment({ ...databaseEnv, CORS_ORIGINS: 'http://localhost:5173/path' }));
  assert.throws(() => readEnvironment({}));
  assert.throws(() => readEnvironment({ ...databaseEnv, DB_TIMEOUT_MS: '0' }));
  assert.equal(readEnvironment(databaseEnv).port, 3000);
});

test('serves health and OpenAPI over HTTP, restricts CORS and returns 404 for unknown routes', async () => {
  const app = await createApplication(readEnvironment(databaseEnv), false);
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const health = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.deepEqual(await health.json(), { status: 'ok', service: 'smart-durian-api' });
    const blocked = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const docs = await fetch(`${base}/api/docs-json`);
    assert.equal(docs.status, 200);
    const schema = await docs.json() as { paths: Record<string, unknown> };
    assert.ok(schema.paths['/api/health']);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  } finally {
    await app.close();
  }
});
