import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { OtpProvider } from '../src/auth/sms/otp.provider';
import { normalizeTwilioPhone, TwilioVerifyConfig, TwilioVerifyGateway } from '../src/auth/sms/twilio-verify.gateway';

const config: TwilioVerifyConfig = {
  provider: 'twilio', accountSid: `AC${'a'.repeat(32)}`, authToken: 'b'.repeat(32), serviceSid: `VA${'c'.repeat(32)}`,
  allowedPhone: '0900000000', liveEnabled: true, timeoutMs: 1000,
};
const env = {
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: config.allowedPhone, AUTH_TEST_PASSWORD: 'LocalTestOnly123!',
  JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
  MONGODB_URI: 'mongodb://127.0.0.1:1/test', SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: config.accountSid,
  TWILIO_AUTH_TOKEN: config.authToken, TWILIO_VERIFY_SERVICE_SID: config.serviceSid, SMS_ALLOWED_PHONE: config.allowedPhone,
  LIVE_SMS_ENABLED: 'true',
};
const service = { sid: config.serviceSid, account_sid: config.accountSid, code_length: 6 };
const verification = {
  sid: `VE${'d'.repeat(32)}`, service_sid: config.serviceSid, account_sid: config.accountSid,
  to: '+84900000000', channel: 'sms', status: 'pending',
};
const proof = { kind: 'twilio' as const, verificationSid: verification.sid, phone: verification.to };
const hasStatus = (status: number) => (error: unknown) => error instanceof HttpException && error.getStatus() === status;

test('Twilio configuration validates credentials, allowlist, timeout and live switch without networking', () => {
  assert.equal(readEnvironment(env).auth?.sms.provider, 'twilio');
  const disabled = readEnvironment({ ...env, LIVE_SMS_ENABLED: undefined }).auth?.sms;
  assert.ok(disabled?.provider === 'twilio' && !disabled.liveEnabled);
  for (const invalid of [
    { TWILIO_ACCOUNT_SID: '' }, { TWILIO_AUTH_TOKEN: 'placeholder' }, { TWILIO_VERIFY_SERVICE_SID: config.accountSid },
    { SMS_ALLOWED_PHONE: '0900000001' }, { SMS_TIMEOUT_MS: '0' }, { LIVE_SMS_ENABLED: 'yes' },
  ]) { assert.throws(() => readEnvironment({ ...env, ...invalid })); }
  assert.equal(normalizeTwilioPhone('0900000000'), '+84900000000');
  assert.equal(normalizeTwilioPhone('84900000000'), '+84900000000');
  assert.equal(normalizeTwilioPhone('+84900000000'), '+84900000000');
  assert.throws(() => normalizeTwilioPhone('123456789'));
});

test('Verify reads six-digit service before send, uses Basic HTTPS form and checks exact SID', async () => {
  const requests: { url: string; method: string; form: URLSearchParams }[] = [];
  const gateway = new TwilioVerifyGateway(config, async (url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`);
    assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    requests.push({ url: String(url), method: String(init?.method), form: new URLSearchParams(String(init?.body ?? '')) });
    return Response.json(requests.length === 1 ? service : { ...verification, status: requests.length === 2 ? 'pending' : 'approved' });
  });
  assert.deepEqual(await gateway.issue(config.allowedPhone), proof);
  assert.equal(await gateway.verify(proof, '012345'), true);
  assert.deepEqual(requests.map((request) => request.url), [
    `https://verify.twilio.com/v2/Services/${config.serviceSid}`,
    `https://verify.twilio.com/v2/Services/${config.serviceSid}/Verifications`,
    `https://verify.twilio.com/v2/Services/${config.serviceSid}/VerificationCheck`,
  ]);
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST', 'POST']);
  assert.equal(requests[1].form.get('To'), verification.to);
  assert.equal(requests[1].form.get('Channel'), 'sms');
  assert.equal(requests[1].form.has('CustomCode'), false);
  assert.equal(requests[2].form.get('VerificationSid'), verification.sid);
  assert.equal(requests[2].form.get('Code'), '012345');
  assert.deepEqual(gateway.messages(), []);
});

test('disabled live sends, wrong recipient and wrong service code length do not send a paid request', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ ...service, code_length: 4 }); };
  await assert.rejects(new TwilioVerifyGateway({ ...config, liveEnabled: false }, fetcher).issue(config.allowedPhone), hasStatus(503));
  await assert.rejects(new TwilioVerifyGateway(config, fetcher).issue('0900000001'), hasStatus(503));
  assert.equal(calls, 0);
  await assert.rejects(new TwilioVerifyGateway(config, fetcher).issue(config.allowedPhone), hasStatus(503));
  assert.equal(calls, 1, 'only the non-sending GET may run');
});

test('wrong/expired/used codes reject; unrelated approved responses never authorize reset', async () => {
  for (const [status, body] of [
    [200, verification], [404, { code: 20404 }], [429, { code: 60202 }],
  ] as const) {
    const gateway = new TwilioVerifyGateway(config, async () => Response.json(body, { status }));
    assert.equal(await gateway.verify(proof, '123456'), false);
  }
  for (const mismatch of [
    { sid: `VE${'e'.repeat(32)}` }, { service_sid: `VA${'e'.repeat(32)}` }, { account_sid: `AC${'e'.repeat(32)}` },
    { to: '+84900000001' }, { channel: 'call' }, { status: 'unknown', valid: true },
  ]) {
    const gateway = new TwilioVerifyGateway(config, async () => Response.json({ ...verification, status: 'approved', ...mismatch }));
    await assert.rejects(gateway.verify(proof, '123456'), hasStatus(503));
  }
});

test('provider HTTP, malformed JSON and timeout failures are sanitized and never retried', async () => {
  const failures: (() => Promise<Response>)[] = [
    async () => Response.json({ code: 20003, message: config.authToken }, { status: 401 }),
    async () => Response.json({ code: 20429 }, { status: 429 }),
    async () => Response.json({ message: config.authToken }, { status: 500 }),
    async () => new Response('invalid JSON'), async () => Response.json(null),
    async () => { throw new DOMException(config.authToken, 'TimeoutError'); },
  ];
  for (const [index, failure] of failures.entries()) {
    let calls = 0;
    const gateway = new TwilioVerifyGateway(config, async () => { calls++; return failure(); });
    await assert.rejects(gateway.verify(proof, '123456'), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), index === 1 ? 429 : 503);
      assert.ok(!error.message.includes(config.authToken) && !error.message.includes('123456'));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('HTTP Verify flow hides outbox, binds challenge and serializes checks/resends before revoking JWT', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  let sends = 0;
  let checks = 0;
  let finishCheck: (() => void) | undefined;
  let notifyCheck: (() => void) | undefined;
  const startedCheck = new Promise<void>((resolve) => { notifyCheck = resolve; });
  const gateway = new TwilioVerifyGateway(config, async (url, init) => {
    if (init?.method === 'GET') { return Response.json(service); }
    if (String(url).endsWith('/Verifications')) { sends++; return Response.json(verification); }
    checks++;
    if (new URLSearchParams(String(init?.body)).get('Code') === '000000') { return Response.json(verification); }
    notifyCheck?.();
    await new Promise<void>((resolve) => { finishCheck = resolve; });
    return Response.json({ ...verification, status: 'approved' });
  });
  const environment = readEnvironment(env);
  const module = await Test.createTestingModule({ imports: [AppModule.register(environment)] })
    .overrideProvider(OtpProvider).useValue(gateway).compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, environment);
  try {
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/auth`;
    const post = (path: string, body: object) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const login = await (await post('login', { phone_number: config.allowedPhone, password: env.AUTH_TEST_PASSWORD })).json() as { access_token: string };
    const reset = { phone_number: config.allowedPhone, otp: '123456', new_password: 'ChangedLocalTest123!' };
    assert.equal((await post('reset-password', reset)).status, 400, 'console OTP alone is not an application challenge');
    assert.equal((await post('forgot-password', { phone_number: '0900000001' })).status, 202);
    assert.equal(sends, 0);
    const send = await post('forgot-password', { phone_number: config.allowedPhone });
    assert.equal(send.status, 202);
    const responseText = await send.text();
    assert.ok(!responseText.includes(verification.sid) && !responseText.includes('123456'));
    assert.equal((await fetch(`${base}/test/sms?phone_number=${config.allowedPhone}`)).status, 404);
    assert.equal((await post('reset-password', { ...reset, otp: '000000' })).status, 400);
    const firstReset = post('reset-password', reset);
    await startedCheck;
    now += 61000;
    assert.equal((await post('forgot-password', { phone_number: config.allowedPhone })).status, 202);
    assert.equal(sends, 1, 'resend is suppressed during provider check');
    assert.equal((await post('reset-password', reset)).status, 400);
    finishCheck?.();
    assert.equal((await firstReset).status, 200);
    assert.equal(checks, 2, 'one wrong code and one successful provider check');
    assert.equal((await post('reset-password', reset)).status, 400);
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${login.access_token}` } })).status, 401);
    assert.equal((await post('login', { phone_number: config.allowedPhone, password: env.AUTH_TEST_PASSWORD })).status, 401);
    assert.equal((await post('login', { phone_number: config.allowedPhone, password: reset.new_password })).status, 200);
  } finally { finishCheck?.(); await app.close(); }
});

test('Verify local expiry/attempt cap and uncertain provider errors cannot change password', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  let checks = 0;
  let fail = false;
  const gateway = new TwilioVerifyGateway(config, async (url, init) => {
    if (init?.method === 'GET') { return Response.json(service); }
    if (String(url).endsWith('/Verifications')) { return Response.json(verification); }
    checks++;
    if (fail) { throw new DOMException('timeout', 'TimeoutError'); }
    return Response.json(verification);
  });
  const environment = readEnvironment(env);
  const module = await Test.createTestingModule({ imports: [AppModule.register(environment)] })
    .overrideProvider(OtpProvider).useValue(gateway).compile();
  const app = module.createNestApplication({ logger: false });
  const { AuthService } = await import('../src/auth/auth.service');
  try {
    await app.init();
    const auth = app.get(AuthService);
    await auth.forgotPassword(config.allowedPhone);
    now += 300000;
    await assert.rejects(auth.resetPassword(config.allowedPhone, '123456', 'ChangedLocalTest123!'), hasStatus(400));
    assert.equal(checks, 0);
    await auth.forgotPassword(config.allowedPhone);
    for (let i = 0; i < 6; i++) { await assert.rejects(auth.resetPassword(config.allowedPhone, '123456', 'ChangedLocalTest123!'), hasStatus(400)); }
    assert.equal(checks, 5);
    now += 61000;
    await auth.forgotPassword(config.allowedPhone);
    fail = true;
    await assert.rejects(auth.resetPassword(config.allowedPhone, '123456', 'ChangedLocalTest123!'), hasStatus(503));
    await assert.rejects(auth.resetPassword(config.allowedPhone, '123456', 'ChangedLocalTest123!'), hasStatus(400));
    assert.equal(checks, 6);
    assert.ok((await auth.login(config.allowedPhone, env.AUTH_TEST_PASSWORD)).access_token);
  } finally { await app.close(); }
});
