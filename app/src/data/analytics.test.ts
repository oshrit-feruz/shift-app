import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What `track` guarantees, and every half matters to the report it feeds:
 *
 *  - a view stage is counted ONCE per session, however many times its screen
 *    mounts. StrictMode double-mounts and screen remounts would otherwise
 *    inflate exactly the numbers being measured;
 *  - a click is counted EVERY time, because it is an act rather than a state;
 *  - the row carries the two anonymous ids and nothing else — in particular
 *    no identity, and no client-supplied timestamp;
 *  - nothing it does can throw or reject into a caller.
 */

const getSession = vi.fn();
const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return { auth: { getSession }, from };
  },
}));

vi.mock('../lib/analyticsIds', () => ({
  anonId: () => 'a-device-0000-1111-2222-3333',
  sessionId: () => 's-session-0000-1111-2222-333',
}));

/**
 * A sessionStorage that persists across module reloads within a case, which
 * is what makes the reload test below a real reload: the browser keeps
 * sessionStorage when the page reloads, and so must this.
 */
function installSessionStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

/** A sessionStorage that throws on every access, as Safari private mode can. */
function installThrowingSessionStorage() {
  vi.stubGlobal('sessionStorage', {
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
 * Reimports the module with a clean module registry — which is exactly what a
 * page reload does to it, and why it can stand in for one.
 */
async function freshModule() {
  vi.resetModules();
  return import('./analytics');
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  insert.mockResolvedValue({ error: null });
  installSessionStorage();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Lets the fire-and-forget write settle before assertions. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('track', () => {
  it('writes the stage with both anonymous ids into the events table', async () => {
    const { track, FUNNEL_TABLE } = await freshModule();

    track('reco_started');
    await settle();

    expect(from).toHaveBeenCalledWith(FUNNEL_TABLE);
    expect(insert).toHaveBeenCalledWith({
      name: 'reco_started',
      session_id: 's-session-0000-1111-2222-333',
      anon_id: 'a-device-0000-1111-2222-3333',
    });
  });

  it('writes no identity and no client timestamp', async () => {
    // The privacy property and the clock property, asserted rather than
    // asserted-in-a-comment. created_at is the column default (the server's
    // clock) and the column grant in the migration forbids setting it.
    const { track } = await freshModule();

    track('reco_started');
    await settle();

    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(['anon_id', 'name', 'session_id']);
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('user_id');
  });

  it.each(['reco_started', 'reco_completed', 'broker_screen_viewed'] as const)(
    'counts %s once per session however often the screen remounts',
    async (name) => {
      const { track } = await freshModule();

      track(name);
      track(name);
      track(name);
      await settle();

      expect(insert).toHaveBeenCalledTimes(1);
    },
  );

  /**
   * Two calls in one frame, three different reasons for the count they
   * produce — collected in one table because the contrast between the rows
   * IS the contract, and it is easier to check three rows against each other
   * than three test bodies.
   *
   * The first row is the StrictMode case: it mounts every component twice in
   * the same frame, so a guard that only closed after the write landed would
   * let both through. The second says a click is an act and is never
   * collapsed. The third says the guard is per stage, not global.
   */
  it.each([
    ['collapses two mounts of one view stage', ['reco_completed', 'reco_completed'], 1],
    ['records both of two clicks', ['broker_action_clicked', 'broker_action_clicked'], 2],
    ['keeps two different stages apart', ['reco_started', 'reco_completed'], 2],
  ] as const)('%s', async (_label, events, expected) => {
    const { track } = await freshModule();

    for (const name of events) track(name);
    await settle();

    expect(insert).toHaveBeenCalledTimes(expected);
  });

  it('writes nothing when signed out, which the policy would refuse anyway', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { track } = await freshModule();

    track('reco_started');
    await settle();

    expect(insert).not.toHaveBeenCalled();
  });

  it('swallows a rejected write rather than surfacing it', async () => {
    insert.mockRejectedValue(new Error('offline'));
    const { track } = await freshModule();

    expect(() => track('reco_started')).not.toThrow();
    await expect(settle()).resolves.toBeUndefined();
  });

  it('swallows a failing session read too', async () => {
    getSession.mockRejectedValue(new Error('auth down'));
    const { track } = await freshModule();

    expect(() => track('reco_started')).not.toThrow();
    await expect(settle()).resolves.toBeUndefined();
  });

  it('returns void, so no caller can put the network on a render path', async () => {
    const { track } = await freshModule();

    expect(track('reco_started')).toBeUndefined();
    await settle();
  });

  it('does not re-record a view stage after a reload of the same session', async () => {
    // The regression this guards. sessionId() lives in sessionStorage and
    // survives a reload, so a guard held only in module memory would reset
    // while the id it guards stayed the same — filing a second
    // "saw the allocation" for one person who saw it once.
    const first = await freshModule();
    first.track('reco_completed');
    await settle();
    expect(insert).toHaveBeenCalledTimes(1);

    // The reload: fresh module registry, same sessionStorage.
    const second = await freshModule();
    second.track('reco_completed');
    await settle();

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('still records a click after a reload, because a click is not deduplicated', async () => {
    const first = await freshModule();
    first.track('broker_action_clicked');
    await settle();

    const second = await freshModule();
    second.track('broker_action_clicked');
    await settle();

    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('starts fresh when sessionStorage is a new session', async () => {
    const first = await freshModule();
    first.track('reco_started');
    await settle();

    // A genuinely new tab: new sessionStorage, and a new session id with it.
    installSessionStorage();
    const second = await freshModule();
    second.track('reco_started');
    await settle();

    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('still deduplicates within a page when storage throws', async () => {
    // Storage unusable: the in-memory guard is all there is, and it still
    // covers everything except a reload. The unique index covers the rest.
    installThrowingSessionStorage();
    const { track } = await freshModule();

    track('reco_completed');
    track('reco_completed');
    await settle();

    expect(insert).toHaveBeenCalledTimes(1);
  });
});
