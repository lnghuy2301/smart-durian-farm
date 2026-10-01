import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { DatabaseService } from '../src/database/database.service';

loadEnv({ path: resolve(__dirname, '../../../../.env') });

test('local database readiness and replica-set transactions work', async () => {
  const app = await createApplication(readEnvironment(process.env), false);
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/health/ready`);
    assert.equal(response.status, 200, 'Start Docker Compose and configure .env before running integration tests');
    assert.deepEqual(await response.json(), { status: 'ok', databases: { postgres: 'up', mongodb: 'up' } });
    const database = app.get(DatabaseService);
    const hello = await database.mongo.db('admin').command({ hello: 1 });
    assert.equal(hello.setName, 'rs0');
    assert.equal(hello.isWritablePrimary, true);
    const session = database.mongo.startSession();
    try {
      await session.withTransaction(async () => {
        await database.mongo.db().collection('CULTIVATION_EVENTS').findOne({}, { session });
      });
    } finally { await session.endSession(); }
  } finally { await app.close(); }
});
