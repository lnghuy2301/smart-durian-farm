import { expect, test } from 'vitest';
import { tokenDeadline } from '../src/auth/token';
test('expiry extraction accepts JWT base64url and rejects malformed/non-numeric expiry', () => {
  const token = (value: unknown) => `header.${btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
  expect(tokenDeadline(token({ exp: 1800000000 }))).toBe(1800000000000);
  for (const value of [{ exp: '1800000000' }, {}, { exp: 1e100 }, null]) expect(tokenDeadline(token(value))).toBeUndefined();
  expect(tokenDeadline('broken')).toBeUndefined(); expect(tokenDeadline('a.!.b')).toBeUndefined();
});
