import { describe, expect, it } from 'vitest';
import { open, readKey, seal } from './secretBox.js';

const KEY = readKey(Buffer.alloc(32, 3).toString('base64'));

describe('readKey', () => {
  it('refuses a key of the wrong length rather than encrypting with it', () => {
    // A short key would still "work" for some cipher choices and quietly
    // weaken every stored secret. There is no partial credit here.
    expect(() => readKey(Buffer.alloc(16, 1).toString('base64'))).toThrow(/32 bytes/);
  });

  it('refuses a missing key, naming the variable in the message', () => {
    expect(() => readKey(undefined)).toThrow(/SNAPTRADE_SECRET_KEY/);
  });

  it('accepts base64url as well as standard base64', () => {
    // Keys get pasted from whichever generator was to hand.
    const raw = Buffer.from(Array.from({ length: 32 }, (_, i) => i * 8 - (i % 5)));
    expect(readKey(raw.toString('base64url')).equals(raw)).toBe(true);
  });
});

describe('seal and open', () => {
  it('round-trips a secret', () => {
    expect(open(seal('user-secret-abc', KEY), KEY)).toBe('user-secret-abc');
  });

  it('never produces the same ciphertext twice for the same input', () => {
    // A fresh IV per call. Identical envelopes would let anyone with the
    // table see which users share a secret, and would break GCM outright.
    expect(seal('same', KEY)).not.toBe(seal('same', KEY));
  });

  it('does not leak the plaintext into the envelope', () => {
    expect(seal('user-secret-abc', KEY)).not.toContain('user-secret-abc');
  });

  it('refuses to open with the wrong key', () => {
    expect(open(seal('secret', KEY), readKey(Buffer.alloc(32, 9).toString('base64')))).toBeNull();
  });

  it('refuses a tampered ciphertext instead of returning altered plaintext', () => {
    // The reason this is GCM and not a bare cipher: a row someone edited in
    // the database must fail to open, not decrypt to something else.
    const [v, iv, tag, body] = seal('secret', KEY).split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 0xff;
    expect(open([v, iv, tag, flipped.toString('base64url')].join('.'), KEY)).toBeNull();
  });

  it('refuses a tampered authentication tag', () => {
    const [v, iv, tag, body] = seal('secret', KEY).split('.');
    const flipped = Buffer.from(tag, 'base64url');
    flipped[0] ^= 0xff;
    expect(open([v, iv, flipped.toString('base64url'), body].join('.'), KEY)).toBeNull();
  });

  it('refuses an envelope from an unknown version, rather than guessing at its layout', () => {
    expect(open(seal('secret', KEY).replace(/^v1\./, 'v2.'), KEY)).toBeNull();
  });

  it('refuses a malformed envelope without throwing', () => {
    // Whatever is in the column, a read must return "cannot use this" rather
    // than crash the route that was answering someone.
    for (const bad of ['', 'plaintext', 'v1.only.three', 'v1.a.b.c.d', 'v1...']) {
      expect(open(bad, KEY)).toBeNull();
    }
  });
});
