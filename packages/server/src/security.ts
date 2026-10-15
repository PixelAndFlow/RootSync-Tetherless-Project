/**
 * Credentials.
 *
 * Device tokens and trainer session tokens are opaque random strings: 32 bytes
 * from the operating system's secure random generator, Base64URL-encoded. The
 * phone receives its token once; the server stores only a SHA-256 hash, so a
 * copy of the database can't be used to sign in. Device tokens never expire
 * on a timer (learners may be offline for weeks) but can be revoked.
 *
 * Trainer passwords are hashed with scrypt (built into Node), a memory-hard
 * password hash in the same class as bcrypt and argon2.
 */

import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), Number(N), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Short code like "K7QM-42RX" for cohorts and re-links. */
export function newShortCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Codes are case-insensitive and ignore surrounding spaces. */
export const normalizeCode = (code: string): string => code.trim().toUpperCase();
