import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { normalizeVietnamPhone, SpeedSmsConfig, SpeedSmsGateway } from '../src/auth/sms/speedsms.gateway';
import { SmsGateway } from '../src/auth/sms/sms.gateway';

const options: SpeedSmsConfig = {
  provider: 'speedsms', accessToken: 'fake-token-for-tests', smsType: 4, sender: 'Verify',
  allowedPhone: '0900000000', liveEnabled: true, timeoutMs: 1000,
};
const message = { phone_number: '0900000000', otp: '012345', expires_at: new Date(Date.now() + 300000).toISOString() };
const accepted = { status: 'success', code: '00', data: { totalSMS: 1, invalidPhone: [] } };

test('SpeedSMS adapter uses HTTPS POST, Basic auth and normalized allowlisted number', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.speedsms.vn/index.php/sms/send');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from(`${options.accessToken}:x`).toString('base64')}`);
    const body = JSON.parse(String(init?.body)) as { to: string[]; content: string; sms_type: number; sender: string };
    assert.deepEqual(body.to, ['84900000000']);
    assert.ok(body.content.includes('012345'));
    assert.equal(body.sms_type, 4);
    assert.equal(body.sender, 'Verify');
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json(accepted);
  };
  const gateway = new SpeedSmsGateway(options, fetcher);
  await gateway.send(message);
  assert.equal(calls, 1);
  assert.deepEqual(gateway.messages(), []);
  assert.equal(normalizeVietnamPhone('+84900000000'), '84900000000');
  await assert.rejects(new SpeedSmsGateway({ ...options, liveEnabled: false }, fetcher).send(message));
  await assert.rejects(gateway.send({ ...message, phone_number: '0900000001' }));
  assert.equal(calls, 1, 'blocked sends must not call provider');
});

test('HTTP errors, provider errors, invalid recipients, malformed JSON and timeout are sanitized without retry', async () => {
  const cases: (() => Promise<Response>)[] = [
    async () => Response.json(accepted, { status: 500 }),
    async () => Response.json({ status: 'error', code: '300', message: options.accessToken }),
    async () => Response.json({ ...accepted, data: { totalSMS: 1, invalidPhone: [message.phone_number] } }),
    async () => Response.json({ status: 'success', code: '00' }),
    async () => new Response('not-json'),
    async () => { throw new DOMException('timed out', 'TimeoutError'); },
  ];
  for (const result of cases) {
    let calls = 0;
    await assert.rejects(new SpeedSmsGateway(options, async () => { calls++; return result(); }).send(message), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(options.accessToken) && !error.message.includes(message.otp));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('configuration requires token, recipient match and explicit live switch', () => {
  const env = {
    NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000', AUTH_TEST_PASSWORD: 'TestPassword123!',
    JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
    MONGODB_URI: 'mongodb://127.0.0.1:1/test', SMS_PROVIDER: 'speedsms', SPEEDSMS_ACCESS_TOKEN: 'fake-token', SMS_ALLOWED_PHONE: '0900000000',
  };
  const sms = readEnvironment(env).auth?.sms;
  assert.ok(sms?.provider === 'speedsms');
  assert.equal(sms.liveEnabled, false);
  assert.throws(() => readEnvironment({ ...env, SPEEDSMS_ACCESS_TOKEN: '' }));
  assert.throws(() => readEnvironment({ ...env, SMS_ALLOWED_PHONE: '0900000001' }));
  assert.throws(() => readEnvironment({ ...env, LIVE_SMS_ENABLED: 'yes' }));
});

test('real-provider Auth hides mock outbox, rejects failed-send OTP and serializes sends', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const config = readEnvironment({
    NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000', AUTH_TEST_PASSWORD: 'TestPassword123!',
    JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
    MONGODB_URI: 'mongodb://127.0.0.1:1/test', SMS_PROVIDER: 'speedsms', SPEEDSMS_ACCESS_TOKEN: 'fake-token',
    SMS_ALLOWED_PHONE: '0900000000', LIVE_SMS_ENABLED: 'true',
  });
  let calls = 0;
  let otp = '';
  const gateway = new SpeedSmsGateway(options, async (_url, init) => {
    calls++;
    const content = (JSON.parse(String(init?.body)) as { content: string }).content;
    otp = /\b\d{6}\b/.exec(content)?.[0] ?? '';
    return Response.json(calls === 1 ? { status: 'error', code: '300' } : accepted);
  });
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(SmsGateway).useValue(gateway).compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  try {
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/auth`;
    const post = (path: string, body: object) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const replies = await Promise.all([post('forgot-password', { phone_number: message.phone_number }), post('forgot-password', { phone_number: message.phone_number })]);
    assert.equal(calls, 1);
    assert.deepEqual(replies.map((response) => response.status).sort(), [202, 503]);
    assert.equal((await fetch(`${base}/test/sms?phone_number=${message.phone_number}`)).status, 404);
    assert.equal((await post('reset-password', { phone_number: message.phone_number, otp, new_password: 'ChangedPassword123!' })).status, 400);
    now += 61000;
    assert.equal((await post('forgot-password', { phone_number: message.phone_number })).status, 202);
    assert.equal(calls, 2);
    assert.equal((await post('reset-password', { phone_number: message.phone_number, otp, new_password: 'ChangedPassword123!' })).status, 200);
    assert.equal((await post('login', { phone_number: message.phone_number, password: 'ChangedPassword123!' })).status, 200);
  } finally { await app.close(); }
});
