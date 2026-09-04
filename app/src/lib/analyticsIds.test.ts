import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The ids the funnel is counted by, and the two ways they can go wrong:
 * losing stability (a device that mints a new id every load inflates the
 * device count), and throwing (analytics is never allowed to break a screen).
 *
 * Each case imports the module fresh, because it keeps in-memory fallbacks at
 * module scope that would otherwise carry one case's values into the next.
 */

/** A working storage, seeded with whatever a case wants already stored. */
function makeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    api: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

/** Storage that throws on every access, as Safari private mode can. */
const throwing = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

async function freshModule() {
  vi.resetModules();
  return import('./analyticsIds');
}

afterEach(() => vi.unstubAllGlobals());

describe('analytics ids', () => {
  it('mints and stores an id on a device that has none', async () => {
    const local = makeStorage();
    const session = makeStorage();
    vi.stubGlobal('localStorage', local.api);
    vi.stubGlobal('sessionStorage', session.api);
    const { anonId, sessionId } = await freshModule();

    expect(anonId()).toMatch(/^a-/);
    expect(sessionId()).toMatch(/^a-/);
    expect(local.store.size).toBe(1);
    expect(session.store.size).toBe(1);
  });

  it('returns the same id on every call, so one device counts once', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    vi.stubGlobal('sessionStorage', makeStorage().api);
    const { anonId, sessionId } = await freshModule();

    expect(anonId()).toBe(anonId());
    expect(sessionId()).toBe(sessionId());
  });

  it('keeps a device id already stored, rather than reminting it', async () => {
    const stored = 'a-existing-device-id-value';
    vi.stubGlobal('localStorage', makeStorage({ 'shift.analytics.anonId': stored }).api);
    vi.stubGlobal('sessionStorage', makeStorage().api);
    const { anonId } = await freshModule();

    expect(anonId()).toBe(stored);
  });

  it('keeps the device and session ids apart', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    vi.stubGlobal('sessionStorage', makeStorage().api);
    const { anonId, sessionId } = await freshModule();

    expect(anonId()).not.toBe(sessionId());
  });

  it('replaces a stored value the column would reject', async () => {
    // Truncated or hand-edited. Healed here, where the event still gets sent,
    // rather than at the route, where it would simply be dropped.
    const local = makeStorage({ 'shift.analytics.anonId': 'short' });
    vi.stubGlobal('localStorage', local.api);
    vi.stubGlobal('sessionStorage', makeStorage().api);
    const { anonId } = await freshModule();

    const id = anonId();
    expect(id).not.toBe('short');
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(local.store.get('shift.analytics.anonId')).toBe(id);
  });

  it('still answers, stably, when storage throws', async () => {
    vi.stubGlobal('localStorage', throwing);
    vi.stubGlobal('sessionStorage', throwing);
    const { anonId, sessionId } = await freshModule();

    // The point: no throw, and the page still measures itself correctly for
    // this load even though nothing can be persisted.
    expect(anonId()).toBe(anonId());
    expect(sessionId()).toBe(sessionId());
    expect(anonId()).not.toBe(sessionId());
  });

  it('stays within the length the events table accepts', async () => {
    vi.stubGlobal('localStorage', makeStorage().api);
    vi.stubGlobal('sessionStorage', makeStorage().api);
    const { anonId, sessionId } = await freshModule();

    for (const id of [anonId(), sessionId()]) {
      expect(id.length).toBeGreaterThanOrEqual(8);
      expect(id.length).toBeLessThanOrEqual(64);
    }
  });
});
