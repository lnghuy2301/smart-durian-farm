import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth/password';

test('password hashes use different salts, preserve exact password and reject incorrect passwords', async () => {
  const password = ' mật khẩu kiểm thử 🔐 ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword('incorrect', first), false);
});

test('malformed hashes and untrusted scrypt costs are rejected without deriving a key', async () => {
  for (const hash of ['', 'plaintext', 'scrypt$999999999$8$1$salt$key', 'scrypt$32768$8$1$bad$bad']) {
    assert.equal(await verifyPassword('password', hash), false);
  }
  const valid = await hashPassword('password');
  assert.equal(await verifyPassword('password', `${valid}=`), false);
});
