import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A signed-in session, because every read here is scoped to one. The token
 * itself is opaque — the route is what resolves it — so a fixed string is
 * enough, and it keeps each test about the response it is describing.
 */
let token: string | null = 'access-token';
const USER_ID = 'user-1';
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: token ? { access_token: token, user: { id: USER_ID } } : null },
      }),
    },
  },
}));

import { disconnectBrokerage, fetchConnectedAccounts, startBrokerageConnection } from './snaptradeAccount';
import { isLinked, linkedUserId } from './linkState';

beforeEach(() => {
  token = 'access-token';
});

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ACCOUNT = {
  id: 'acc-1',
  name: 'Individual',
  numberMasked: '••4321',
  institution: 'Interactive Brokers',
  currency: 'USD',
  totalValue: 1000,
  asOf: '2026-08-28T14:30:00Z',
  source: 'realtime' as const,
  balances: [{ currency: 'USD', cash: 100, buyingPower: 200 }],
  positions: [
    {
      ticker: 'AAPL',
      description: 'Apple Inc.',
      units: 4,
      price: 200,
      marketValue: 800,
      avgCost: 150,
      openPnl: 200,
      currency: 'USD',
    },
  ],
};

describe('freshness and source', () => {
  it('carries the brokerage fetch time and the route that answered', async () => {
    const r = await fetchConnectedAccounts(async () => res({ linked: true, accounts: [ACCOUNT] }));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].asOf).toBe('2026-08-28T14:30:00Z');
    expect(r.data.accounts[0].source).toBe('realtime');
  });

  it('defaults to the weaker daily claim when the source is absent or unrecognised', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ linked: true, accounts: [{ ...ACCOUNT, source: undefined, asOf: undefined }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].source).toBe('daily');
    expect(r.data.accounts[0].asOf).toBeNull();
  });
});

describe('fetchConnectedAccounts', () => {
  it('returns the real account on a well-formed response', async () => {
    const r = await fetchConnectedAccounts(async () => res({ linked: true, accounts: [ACCOUNT] }));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts).toEqual([ACCOUNT]);
  });

  it('treats zero connected accounts as a real ok, not an error', async () => {
    const r = await fetchConnectedAccounts(async () => res({ linked: true, accounts: [] }));
    expect(r).toEqual({ status: 'ok', data: { linked: true, accounts: [], connections: [] } });
  });

  it('carries a live connection that reported no accounts, so it is not read as "nothing connected"', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({
        linked: true,
        accounts: [],
        connections: [
          {
            id: 'conn-1',
            brokerage: 'Interactive Brokers',
            disabled: false,
            type: 'read',
            dataFreshnessMode: 'realtime',
            accountCount: 0,
          },
        ],
      }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts).toEqual([]);
    expect(r.data.connections).toHaveLength(1);
    expect(r.data.connections[0]).toMatchObject({ brokerage: 'Interactive Brokers', disabled: false });
  });

  it('drops a connection row with no id rather than half-rendering it', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ linked: true, accounts: [], connections: [{ brokerage: 'Ghost' }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.connections).toEqual([]);
  });

  it('reports a missing-credentials fault with its own specific reason', async () => {
    const r = await fetchConnectedAccounts(async () => res({ error: 'not_configured' }, 500));
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason?.he).toContain('אינו מוגדר');
  });

  it('reports rejected credentials distinctly from an unreachable service', async () => {
    const rejected = await fetchConnectedAccounts(async () => res({ error: 'upstream_unauthorized' }, 502));
    const unreachable = await fetchConnectedAccounts(async () => res({ error: 'upstream_unavailable' }, 502));
    expect(rejected.status).toBe('unavailable');
    expect(unreachable.status).toBe('unavailable');
    if (rejected.status !== 'unavailable' || unreachable.status !== 'unavailable') return;
    expect(rejected.reason).not.toEqual(unreachable.reason);
  });

  it('falls back to the generic reason when an error body is not JSON', async () => {
    const r = await fetchConnectedAccounts(
      async () =>
        ({
          ok: false,
          status: 502,
          json: async () => {
            throw new Error('not json');
          },
        }) as unknown as Response,
    );
    expect(r.status).toBe('unavailable');
  });

  it('reports an unrecognised shape rather than guessing at it', async () => {
    const r = await fetchConnectedAccounts(async () => res({ linked: true, accounts: 'nope' }));
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason?.en).toMatch(/shape/);
  });

  it('reports a network failure as unavailable and never as demo data', async () => {
    const r = await fetchConnectedAccounts(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r.status).toBe('unavailable');
  });

  it('drops a position with no ticker instead of rendering a blank row', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ linked: true, accounts: [{ ...ACCOUNT, positions: [{ units: 1 }, ACCOUNT.positions[0]] }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].positions.map((p) => p.ticker)).toEqual(['AAPL']);
  });

  it('keeps an unreported number as null rather than coercing it to zero', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({
        linked: true,
        accounts: [{ ...ACCOUNT, totalValue: undefined, positions: [{ ticker: 'NVDA' }] }],
      }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].totalValue).toBeNull();
    expect(r.data.accounts[0].positions[0]).toMatchObject({
      ticker: 'NVDA',
      units: null,
      price: null,
      marketValue: null,
    });
  });

  it('drops an account with no id — it could not be addressed or trusted', async () => {
    const r = await fetchConnectedAccounts(async () => res({ linked: true, accounts: [{ name: 'ghost' }] }));
    expect(r).toEqual({ status: 'ok', data: { linked: true, accounts: [], connections: [] } });
  });

  it('answers "nothing connected" for a signed-out reader without asking the server', async () => {
    // Not a failure: there is no user for the route to resolve, and the app's
    // own data is what a signed-out reader sees anyway.
    token = null;
    let called = false;
    const r = await fetchConnectedAccounts(async () => {
      called = true;
      return res({ linked: true, accounts: [ACCOUNT] });
    });
    expect(r).toEqual({ status: 'ok', data: { linked: false, accounts: [], connections: [] } });
    expect(called).toBe(false);
  });

  it('records the answer against the user it is about, not whoever is signed in later', async () => {
    // A response that lands after a sign-out or an account switch must not be
    // read as the new user's. The id travels with the answer so the auth layer
    // can tell whose it is and drop it (auth/AuthProvider.tsx).
    await fetchConnectedAccounts(async () => res({ linked: true, accounts: [ACCOUNT] }));
    expect(isLinked()).toBe(true);
    expect(linkedUserId()).toBe(USER_ID);
  });

  it("remembers the server's word on whether anything is connected", async () => {
    await fetchConnectedAccounts(async () => res({ linked: true, accounts: [ACCOUNT] }));
    expect(isLinked()).toBe(true);
    // And corrects it: a stale "linked" must not survive one honest answer.
    await fetchConnectedAccounts(async () => res({ linked: false, accounts: [] }));
    expect(isLinked()).toBe(false);
  });
});

describe('connecting and disconnecting', () => {
  it('returns the portal URL to send the user to', async () => {
    const r = await startBrokerageConnection(async () =>
      res({ redirectURI: 'https://app.snaptrade.com/portal/abc' }),
    );
    expect(r).toEqual({ status: 'ok', data: { redirectURI: 'https://app.snaptrade.com/portal/abc' } });
  });

  it('reports a response with no portal URL rather than navigating nowhere', async () => {
    const r = await startBrokerageConnection(async () => res({ sessionId: 'only-this' }));
    expect(r.status).toBe('unavailable');
  });

  it('names the half-removed previous connection instead of a generic failure', async () => {
    // The 409 the link route answers when SnapTrade still holds a user whose
    // secret this app no longer has. Retrying in a moment is the real remedy,
    // so that is what it says.
    const r = await startBrokerageConnection(async () => res({ error: 'link_reset' }, 409));
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason?.en).toMatch(/being removed/);
  });

  it('asks for a sign-in rather than calling the route with no session', async () => {
    token = null;
    let called = false;
    const r = await startBrokerageConnection(async () => {
      called = true;
      return res({ redirectURI: 'https://app.snaptrade.com/portal/abc' });
    });
    expect(r.status).toBe('unavailable');
    expect(called).toBe(false);
  });

  it('forgets the link only once the server confirms it is gone', async () => {
    await fetchConnectedAccounts(async () => res({ linked: true, accounts: [ACCOUNT] }));
    expect(isLinked()).toBe(true);

    const failed = await disconnectBrokerage(async () => res({ error: 'upstream_error' }, 502));
    expect(failed.status).toBe('unavailable');
    // Still connected, because it still is: telling the app otherwise would
    // hide a live brokerage connection the user thinks they revoked.
    expect(isLinked()).toBe(true);

    const done = await disconnectBrokerage(async () => res({ disconnected: true }));
    expect(done.status).toBe('ok');
    expect(isLinked()).toBe(false);
  });
});
