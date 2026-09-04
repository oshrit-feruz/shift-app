import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The one job of migrateLegacyDemoDefault: flipping the default must not
 * reach backwards into installs that were already running with it on.
 *
 * The distinction it turns on is that `set` writes '1' or '0' explicitly, so
 * a PRESENT key means the reader chose, and an ABSENT one means they never
 * did. Among those who never chose, a browser carrying app state was using
 * the app under the old default; a browser carrying none is new.
 */

/** A working localStorage, seeded with whatever a case wants already stored. */
function withStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Storage that throws on every access, as Safari private mode can. */
function withBrokenStorage() {
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  });
}

/**
 * Storage that reads but cannot write — Safari's private mode, which is the
 * configuration this migration is most likely to meet a problem in: it lets
 * getItem succeed and makes setItem throw.
 */
function withReadOnlyStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem() {
      throw new Error('quota');
    },
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** Reimports the flags module with a clean in-memory fallback. */
async function freshModule() {
  vi.resetModules();
  return import('./demoFlags');
}

const DEMO_KEY = 'shift.demo.data';
const STATE_KEY = 'shift.state';

afterEach(() => vi.unstubAllGlobals());

describe('migrateLegacyDemoDefault', () => {
  it('keeps demo data on for an install that was using it under the old default', async () => {
    // The case the migration exists for: used the app, never touched the
    // switch. Flipping the default must not change what they see.
    const store = withStorage({ [STATE_KEY]: '{"watchlist":["NVDA"]}' });
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    migrateLegacyDemoDefault();

    expect(store.get(DEMO_KEY)).toBe('1');
    expect(DEMO_FLAGS.demoData).toBe(true);
  });

  it('leaves a fresh install on the new default', async () => {
    const store = withStorage();
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    migrateLegacyDemoDefault();

    // No key written: "has never chosen" stays true, and the default answers.
    expect(store.has(DEMO_KEY)).toBe(false);
    expect(DEMO_FLAGS.demoData).toBe(false);
  });

  it('honours an explicit OFF from a reader who had already turned it off', async () => {
    const store = withStorage({ [DEMO_KEY]: '0', [STATE_KEY]: '{}' });
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    migrateLegacyDemoDefault();

    expect(store.get(DEMO_KEY)).toBe('0');
    expect(DEMO_FLAGS.demoData).toBe(false);
  });

  it('honours an explicit ON and does not rewrite it', async () => {
    const store = withStorage({ [DEMO_KEY]: '1' });
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    migrateLegacyDemoDefault();

    expect(store.get(DEMO_KEY)).toBe('1');
    expect(DEMO_FLAGS.demoData).toBe(true);
  });

  it('is idempotent — a second load does not revive demo mode after it is turned off', async () => {
    // The regression that would matter most: migrate, reader turns it off,
    // next load migrates again. If the migration keyed on anything but the
    // key's presence, it would undo their choice on every boot.
    const store = withStorage({ [STATE_KEY]: '{}' });
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    migrateLegacyDemoDefault();
    expect(store.get(DEMO_KEY)).toBe('1');

    DEMO_FLAGS.set('demoData', false);
    migrateLegacyDemoDefault();

    expect(store.get(DEMO_KEY)).toBe('0');
    expect(DEMO_FLAGS.demoData).toBe(false);
  });

  it('keeps demo on for the session when the read works but the write fails', async () => {
    // Safari private mode. Without recording to memory before attempting the
    // write, the throw would escape with nothing set, `read` would fall to
    // the new default, and a legacy reader would lose demo mode after all —
    // in the one browser where they are least likely to get it back.
    const store = withReadOnlyStorage({ [STATE_KEY]: '{"watchlist":["NVDA"]}' });
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    expect(() => migrateLegacyDemoDefault()).not.toThrow();

    // Nothing persisted, because nothing can be.
    expect(store.has(DEMO_KEY)).toBe(false);
    // But the session still answers correctly.
    expect(DEMO_FLAGS.demoData).toBe(true);
  });

  it('does not throw when storage is unreachable', async () => {
    withBrokenStorage();
    const { migrateLegacyDemoDefault, DEMO_FLAGS } = await freshModule();

    expect(() => migrateLegacyDemoDefault()).not.toThrow();
    // A browser that cannot store anything cannot have been carrying state
    // either, so the new default is the right answer for it.
    expect(DEMO_FLAGS.demoData).toBe(false);
  });
});
