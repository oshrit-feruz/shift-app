import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What `track` guarantees, and both halves matter to the report it feeds:
 *
 *  - a view stage is counted ONCE per session, however many times its screen
 *    mounts. StrictMode double-mounts and screen remounts would otherwise
 *    inflate exactly the numbers being measured;
 *  - a click is counted EVERY time, because it is an act rather than a state;
 *  - nothing it does can throw or reject into a caller.
 */

const getSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return { auth: { getSession } };
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

/**
 * Whatever the module posted, one entry per fetch call.
 *
 * Typed with the argument list the assertions read (`[url, init]`) rather
 * than left for vi.fn to infer from the zero-argument implementation, which
 * would infer an empty tuple and make every `mock.calls[0][1]` a type error.
 */
function stubFetch(impl?: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    impl ?? (async () => new Response('', { status: 202 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Lets the fire-and-forget request settle before assertions. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('track', () => {
  it('sends the stage with both anonymous ids and no identity', async () => {
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('reco_started');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'reco_started',
      sessionId: 's-session-0000-1111-2222-333',
      anonId: 'a-device-0000-1111-2222-3333',
    });
  });

  it('carries the caller’s bearer token, which the route requires', async () => {
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('reco_started');
    await settle();

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it.each(['reco_started', 'reco_completed', 'broker_screen_viewed'] as const)(
    'counts %s once per session however often the screen remounts',
    async (name) => {
      const fetchMock = stubFetch();
      const { track } = await freshModule();

      track(name);
      track(name);
      track(name);
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('deduplicates synchronous double-mounts, not just settled ones', async () => {
    // StrictMode mounts twice in the same frame, so a guard that only closed
    // after the response landed would let both through.
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('reco_completed');
    track('reco_completed');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('counts every broker_action_clicked, because a click is an act', async () => {
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('broker_action_clicked');
    track('broker_action_clicked');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the stages apart', async () => {
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('reco_started');
    track('reco_completed');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when there is no session to authorise it', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = stubFetch();
    const { track } = await freshModule();

    track('reco_started');
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected request rather than surfacing it', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    const { track } = await freshModule();

    expect(() => track('reco_started')).not.toThrow();
    await expect(settle()).resolves.toBeUndefined();
  });

  it('swallows a failing session read too', async () => {
    getSession.mockRejectedValue(new Error('auth down'));
    stubFetch();
    const { track } = await freshModule();

    expect(() => track('reco_started')).not.toThrow();
    await expect(settle()).resolves.toBeUndefined();
  });

  it('returns void, so no caller can put the network on a render path', async () => {
    stubFetch();
    const { track } = await freshModule();

    expect(track('reco_started')).toBeUndefined();
    await settle();
  });
});
