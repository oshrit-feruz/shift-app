import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The switch's defaults, and the one way a default can go wrong.
 *
 * `demoData` starts OFF now, and `set` still writes BOTH directions
 * explicitly — which is what lets migrateLegacyDemoDefault tell "chose off"
 * apart from "never chose". That is the whole risk this file exists to hold down: while the
 * default was off, recording "off" by deleting the key was harmless, and the
 * moment the default flips it becomes a switch that undoes itself on reload.
 *
 * Each case imports the module fresh, because the flags keep an in-memory
 * fallback at module scope that would otherwise carry one case's writes into
 * the next.
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

/** A localStorage that throws on every access — Safari private mode, cookies blocked. */
function withBrokenStorage() {
  const deny = () => {
    throw new Error('denied');
  };
  vi.stubGlobal('localStorage', { getItem: deny, setItem: deny, removeItem: deny });
}

/** Reimports the flags with a clean in-memory fallback, so one case's writes
 *  cannot answer the next one's reads. */
async function freshFlags() {
  vi.resetModules();
  return (await import('./demoFlags')).DEMO_FLAGS;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaults', () => {
  it('starts with sample data OFF, so a first run is about the reader’s own money', async () => {
    withStorage();
    expect((await freshFlags()).demoData).toBe(false);
  });

  it('starts with the QA switch off', async () => {
    withStorage();
    // Not a state to put a reader in without them asking for it: it renders
    // failure states on purpose.
    expect((await freshFlags()).unavailable).toBe(false);
  });

  it('keeps the default when storage cannot be reached at all', async () => {
    withBrokenStorage();
    expect((await freshFlags()).demoData).toBe(false);
  });
});

describe('a stored choice', () => {
  it('persists "off" for a flag whose default is on', async () => {
    // The regression this file is named for. Recording "off" by removing the
    // key would read back as the default — on — so the switch would turn
    // itself back on at the next load.
    const store = withStorage();
    const flags = await freshFlags();
    flags.set('demoData', false);
    expect(store.get(flags.key.demoData)).toBe('0');

    // A fresh load of the module sees only what was written.
    withStorage(Object.fromEntries(store));
    expect((await freshFlags()).demoData).toBe(false);
  });

  it('persists "on" for a flag whose default is off', async () => {
    const store = withStorage();
    const flags = await freshFlags();
    flags.set('unavailable', true);
    expect(store.get(flags.key.unavailable)).toBe('1');
    expect(flags.unavailable).toBe(true);
  });

  it('wins over the default in both directions', async () => {
    const flags = await freshFlags();
    withStorage({ 'shift.demo.data': '0', 'shift.demo.unavailable': '1' });
    expect(flags.demoData).toBe(false);
    expect(flags.unavailable).toBe(true);
  });

  it('holds for the session when the write throws', async () => {
    // Storage is unavailable, so nothing persists — but the switch the reader
    // just flipped must still be in effect until they leave.
    withBrokenStorage();
    const flags = await freshFlags();
    flags.set('demoData', false);
    expect(flags.demoData).toBe(false);
  });

  it('notifies subscribers so the data layer re-reads', async () => {
    withStorage();
    const flags = await freshFlags();
    const seen = vi.fn();
    const off = flags.subscribe(seen);
    flags.set('demoData', false);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    flags.set('demoData', true);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
