import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);
const iterations = 310000;
const keyLength = 32;
const digest = 'sha256';

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, iterations, keyLength, digest);
  return { hash: hash.toString('hex'), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const actual = await pbkdf2Async(password, salt, iterations, keyLength, digest);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
