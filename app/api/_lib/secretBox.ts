/**
 * Authenticated encryption for the one secret this app stores on a user's
 * behalf: their SnapTrade `userSecret`, which is the credential that reads
 * their brokerage account.
 *
 * AES-256-GCM, not AES-CBC and not a bare cipher: GCM authenticates as well as
 * encrypts, so a row someone altered in the database fails to open rather than
 * decrypting to a different string. The key never reaches the database (it is
 * an environment variable the server reads) and never reaches the browser (no
 * VITE_ prefix), which is what makes a dump of `snaptrade_users` useless on its
 * own.
 *
 * Envelope: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. The version
 * prefix is not decoration — it is the thing that lets the scheme change later
 * without a migration that has to guess how each existing row was written.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
/** GCM's standard nonce length. 96 bits is what the mode is specified for. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/**
 * Reads the 32-byte key from its base64 form, or throws.
 *
 * Throws rather than returning null because every caller's only sane response
 * to a missing or malformed key is the same honest 500: a deployment that
 * cannot encrypt must not quietly store plaintext, and one that cannot decrypt
 * must not report "no account linked" for a user who has one.
 */
export function readKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('SNAPTRADE_SECRET_KEY is not set');
  // base64url and standard base64 both decode here, so a key pasted from
  // either `openssl rand -base64 32` or a URL-safe generator works.
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`SNAPTRADE_SECRET_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

/** Encrypts one secret. A fresh random IV per call — never a counter, never reused. */
export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(body)].join('.');
}

/**
 * Opens a sealed secret, or returns null.
 *
 * Null covers every way this can fail — an unknown version, a truncated
 * envelope, a wrong key, a tampered tag — because the caller treats them
 * identically: it cannot read this user's brokerage account and must say so.
 * Distinguishing them in the response would describe the state of the
 * ciphertext to whoever asked.
 */
export function open(envelope: string, key: Buffer): string | null {
  const parts = envelope.split('.');
  if (parts.length !== 4) return null;
  const [version, ivPart, tagPart, bodyPart] = parts;
  if (version !== VERSION) return null;
  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(Buffer.from(bodyPart, 'base64url')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    // final() throws on a failed tag check. That is the mode working, not an
    // error to surface.
    return null;
  }
}
