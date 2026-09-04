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

async function freshModule() {
  vi.resetModules();
  return import('./analytics');
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  insert.mockResolvedValue({ error: null });
});

afterEach(() => vi.clearAllMocks());

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

  it('deduplicates synchronous double-mounts, not just settled ones', async () => {
    // StrictMode mounts twice in the same frame, so a guard that only closed
    // after the write landed would let both through.
    const { track } = await freshModule();

    track('reco_completed');
    track('reco_completed');
    await settle();

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('counts every broker_action_clicked, because a click is an act', async () => {
    const { track } = await freshModule();

    track('broker_action_clicked');
    track('broker_action_clicked');
    await settle();

    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('keeps the stages apart', async () => {
    const { track } = await freshModule();

    track('reco_started');
    track('reco_completed');
    await settle();

    expect(insert).toHaveBeenCalledTimes(2);
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
});
