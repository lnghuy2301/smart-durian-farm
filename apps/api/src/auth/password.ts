import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}`;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  // scrypt chạy bất đồng bộ để việc hash không chặn luồng xử lý HTTP.
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return `${PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  // Chỉ chấp nhận cấu hình do hệ thống tạo, tránh hash hỏng yêu cầu RAM/CPU quá lớn.
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== PREFIX) { return false; }
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH ||
      salt.toString('base64url') !== parts[4] || expected.toString('base64url') !== parts[5]) {
    return false;
  }
  const actual = await deriveKey(password, salt);
  // So sánh constant-time, không dừng sớm tại byte đầu tiên khác nhau.
  return timingSafeEqual(actual, expected);
}
