import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../src/application';
import { readEnvironment } from '../src/config/environment';
import { AuthService } from '../src/auth/auth.service';
import { MockUserStore } from '../src/auth/mock-user.store';
import { JwtService } from '@nestjs/jwt';

const testEnv = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000',
  AUTH_TEST_PASSWORD: 'LocalTestOnly123!', JWT_SECRET: 'test-only-secret-with-at-least-32-bytes',
};

test('mock auth cannot start in production or with incomplete configuration', () => {
  assert.throws(() => readEnvironment({ ...testEnv, NODE_ENV: 'production' }));
  assert.throws(() => readEnvironment({ ...testEnv, NODE_ENV: undefined }));
  assert.throws(() => readEnvironment({ ...testEnv, JWT_SECRET: 'short' }));
  assert.throws(() => readEnvironment({ ...testEnv, AUTH_MODE: 'real' }));
});

test('HTTP login, OTP and reset validate inputs and revoke old tokens without touching databases', async () => {
  const app = await createApplication(readEnvironment(testEnv), false);
  try {
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/auth`;
    const post = (path: string, body: object) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const credentials = { phone_number: testEnv.AUTH_TEST_PHONE, password: testEnv.AUTH_TEST_PASSWORD };
    assert.equal((await post('login', { ...credentials, role: 'Admin' })).status, 400);
    assert.equal((await post('login', { ...credentials, phone_number: '0900000001' })).status, 401);
    assert.equal((await post('login', { ...credentials, password: 'incorrect-password' })).status, 401);
    assert.equal((await fetch(`${base}/me`)).status, 401);
    const login = await post('login', credentials);
    assert.equal(login.status, 200);
    const session = await login.json() as { access_token: string; user: Record<string, unknown> };
    assert.equal(session.user.password, undefined);
    const me = () => fetch(`${base}/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    assert.equal((await me()).status, 200);
    const expired = await app.get(JwtService).signAsync({ sub: session.user.id, version: 0 }, { expiresIn: -1 });
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: 'Bearer invalid-token' } })).status, 401);
    const forgot = await post('forgot-password', { phone_number: credentials.phone_number });
    assert.equal(forgot.status, 202);
    const forgotBody = await forgot.json();
    assert.equal(JSON.stringify(forgotBody).includes('otp'), false);
    const sms = await fetch(`${base}/test/sms?phone_number=${credentials.phone_number}`);
    const outbox = await sms.json() as { messages: { otp: string }[] };
    const otp = outbox.messages[0].otp;
    assert.match(otp, /^\d{6}$/);
    assert.equal((await post('forgot-password', { phone_number: '0900000001' })).status, 202);
    const newPassword = 'ChangedLocalTest123!';
    const reset = { phone_number: credentials.phone_number, otp, new_password: newPassword };
    assert.equal((await post('reset-password', { ...reset, otp: 'abc' })).status, 400);
    const responses = await Promise.all([post('reset-password', reset), post('reset-password', reset)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    assert.equal((await me()).status, 401);
    assert.equal((await post('login', credentials)).status, 401);
    assert.equal((await post('login', { ...credentials, password: newPassword })).status, 200);
    assert.equal((await post('reset-password', reset)).status, 400);
    const store = app.get(MockUserStore);
    store.user.status = 'Locked';
    assert.equal((await post('login', { ...credentials, password: newPassword })).status, 401);
  } finally { await app.close(); }
});

test('OTP expires, resend replaces old code, wrong attempts lock challenge and request limits apply', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const app = await createApplication(readEnvironment(testEnv), false);
  try {
    await app.init();
    const auth = app.get(AuthService);
    const phone = testEnv.AUTH_TEST_PHONE;
    auth.forgotPassword(phone);
    const first = auth.testSms(phone).messages[0];
    auth.forgotPassword(phone);
    assert.deepEqual(auth.testSms(phone).messages[0], first, 'cooldown must keep current code');
    now += 5 * 60 * 1000;
    await assert.rejects(auth.resetPassword(phone, first.otp, 'ChangedLocalTest123!'));
    auth.forgotPassword(phone);
    const current = auth.testSms(phone).messages[0].otp;
    const wrong = current === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      await assert.rejects(auth.resetPassword(phone, wrong, 'ChangedLocalTest123!'));
    }
    await assert.rejects(auth.resetPassword(phone, current, 'ChangedLocalTest123!'));
    for (let attempt = 0; attempt < 4; attempt++) { auth.forgotPassword(phone); }
    assert.throws(() => auth.forgotPassword(phone));
  } finally { await app.close(); }
});
