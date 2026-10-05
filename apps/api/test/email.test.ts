import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { readEnvironment } from '../src/config/environment';
import { DisabledEmailSender, SmtpConfig, SmtpEmailSender } from '../src/users/email/email.sender';

const config: SmtpConfig = {
  provider: 'smtp', host: 'smtp.gmail.com', port: 465, secure: true, user: 'sender@example.com',
  password: 'test-app-password', from: 'sender@example.com', timeoutMs: 10000,
};
const env = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000',
  AUTH_TEST_PASSWORD: 'LocalTestOnly123!', JWT_SECRET: 'test-only-secret-with-at-least-32-bytes',
  EMAIL_PROVIDER: 'smtp', SMTP_HOST: config.host, SMTP_USER: config.user,
  SMTP_PASSWORD: config.password, SMTP_FROM: config.from,
};

test('SMTP and Admin config fail fast for missing/invalid fields; disabled email leaves Auth available', () => {
  assert.equal(readEnvironment(env).auth!.email!.port, 465);
  assert.equal(readEnvironment({ ...env, SMTP_PORT: '587', SMTP_SECURE: 'false' }).auth!.email!.secure, false);
  assert.equal(readEnvironment({ ...env, EMAIL_PROVIDER: 'disabled', SMTP_PASSWORD: '' }).auth!.email, undefined);
  for (const invalid of [
    { SMTP_PASSWORD: '' }, { SMTP_FROM: 'bad' }, { SMTP_HOST: 'https://smtp.gmail.com' },
    { SMTP_PORT: '0' }, { SMTP_PORT: '465', SMTP_SECURE: 'false' },
    { SMTP_PORT: '587', SMTP_SECURE: 'true' }, { SMTP_TIMEOUT_MS: '30001' },
    { EMAIL_PROVIDER: 'mock' }, { AUTH_TEST_ADMIN_PHONE: '0900000001' },
    { AUTH_TEST_ADMIN_PHONE: '+84900000000', AUTH_TEST_ADMIN_PASSWORD: 'AdminTestOnly123!' },
  ]) { assert.throws(() => readEnvironment({ ...env, ...invalid })); }
});

test('SMTP uses TLS, bounded timeouts and text mail without revealing or storing OTP in config', async (context) => {
  let options: Record<string, unknown> | undefined;
  let mail: Record<string, unknown> | undefined;
  const transport = { sendMail: async (input: Record<string, unknown>) => {
    mail = input;
    return { accepted: ['receiver@outlook.com'], rejected: [] };
  } } as unknown as Transporter;
  context.mock.method(nodemailer, 'createTransport', (input: Record<string, unknown>) => { options = input; return transport; });
  const sender = new SmtpEmailSender({ ...config, port: 587, secure: false });
  await sender.sendVerification('receiver@outlook.com', '001234');
  assert.equal(options!.secure, false);
  assert.equal(options!.requireTLS, true);
  assert.equal(options!.socketTimeout, 10000);
  assert.equal(options!.connectionTimeout, 10000);
  assert.equal(options!.greetingTimeout, 10000);
  assert.equal(options!.dnsTimeout, 10000);
  assert.deepEqual(options!.tls, { minVersion: 'TLSv1.2' });
  assert.equal(options!.disableFileAccess, true);
  assert.equal(options!.disableUrlAccess, true);
  assert.equal(options!.debug, false);
  assert.equal(mail!.to, 'receiver@outlook.com');
  assert.equal(mail!.from, config.from);
  assert.match(mail!.text as string, /001234/);
  assert.equal(JSON.stringify(mail).includes(config.password), false);
  assert.equal(mail!.html, undefined);
});

test('SMTP rejection/error is sanitized and never retried; disabled sender cannot grant verification', async (context) => {
  const warnings: string[] = [];
  context.mock.method(Logger.prototype, 'warn', (message: string) => { warnings.push(message); });
  for (const result of ['rejected', 'network', 'unconfirmed']) {
    let sends = 0;
    const transport = { sendMail: async () => {
      sends++;
      if (result === 'network') { throw new Error(`${config.password}: receiver@example.net OTP 001234`); }
      return { accepted: result === 'unconfirmed' ? [] : ['receiver@example.net'], rejected: result === 'rejected' ? ['receiver@example.net'] : [] };
    } } as unknown as Transporter;
    await assert.rejects(new SmtpEmailSender(config, transport).sendVerification('receiver@example.net', '001234'), ServiceUnavailableException);
    assert.equal(sends, 1);
  }
  assert.equal(warnings.length, 3);
  assert.equal(warnings.some((message) => /001234|receiver@|test-app-password/.test(message)), false);
  await assert.rejects(new DisabledEmailSender().sendVerification(), ServiceUnavailableException);
});
