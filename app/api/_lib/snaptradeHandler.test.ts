import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler } from '../snaptrade.js';
// The response stand-in is the shared one the other two route suites use —
// a local copy of it was 28 duplicated lines for no benefit.
import { makeRes } from './failureContract.js';
import { seal } from './secretBox.js';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_NAMES = [
  'SNAPTRADE_CLIENT_ID',
  'SNAPTRADE_CONSUMER_KEY',
  'SNAPTRADE_PERSONAL_CLIENT_ID',
  'SNAPTRADE_PERSONAL_CONSUMER_KEY',
  'SNAPTRADE_SECRET_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));

const SUPABASE_URL = 'https://project.supabase.co';
/** 32 bytes, fixed so a sealed secret written in one test opens in the next. */
const ENC_KEY_B64 = Buffer.alloc(32, 7).toString('base64');
/** Who the access token resolves to. Never anything the request carried. */
const AUTH_USER_ID = '11111111-2222-3333-4444-555555555555';
const USER_SECRET = 'snaptrade-user-secret-abc';

/** A signed-in GET. The token is opaque here — Supabase is what resolves it. */
const REQ = { method: 'GET', query: {}, headers: { authorization: 'Bearer access-token' } };

/**
 * What Supabase answers, by URL. Overridable per test so the unauthorised,
 * unreachable and never-linked paths can each be exercised.
 */
let supabaseUser: () => Promise<Response> = async () => jsonResponse({ id: AUTH_USER_ID });
let snaptradeRow: () => Promise<Response> = async () =>
  jsonResponse([
    { snaptrade_user_id: AUTH_USER_ID, user_secret: seal(USER_SECRET, Buffer.from(ENC_KEY_B64, 'base64')) },
  ]);

/**
 * Installs a fetch mock that answers the session lookups itself and passes
 * everything else to `impl`.
 *
 * Written this way so each test still says only what it is about: the
 * SnapTrade responses. The two Supabase calls are the same in almost every
 * test, and repeating them would bury the one line that differs — and because
 * `impl` never sees them, an assertion on which URLs were requested still
 * counts only the upstream ones.
 */
function upstream(impl: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return supabaseUser();
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/snaptrade_users`)) return snaptradeRow();
    return impl(input, init);
  });
}

const CONNECTION = {
  id: 'conn-1',
  brokerage: { name: 'Interactive Brokers', display_name: 'Interactive Brokers' },
  disabled: false,
  type: 'read',
  data_freshness_mode: 'realtime',
};

const ACCOUNT = {
  id: 'acc-1',
  brokerage_authorization: 'conn-1',
  name: 'Individual',
  number: '987654321',
  institution_name: 'Interactive Brokers',
  balance: { total: { amount: 1000, currency: 'USD' } },
};

beforeEach(() => {
  process.env.SNAPTRADE_CLIENT_ID = 'demo-client';
  process.env.SNAPTRADE_CONSUMER_KEY = 'demo-key';
  process.env.SNAPTRADE_SECRET_KEY = ENC_KEY_B64;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  delete process.env.SNAPTRADE_PERSONAL_CLIENT_ID;
  delete process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY;
  supabaseUser = async () => jsonResponse({ id: AUTH_USER_ID });
  snaptradeRow = async () =>
    jsonResponse([
      { snaptrade_user_id: AUTH_USER_ID, user_secret: seal(USER_SECRET, Buffer.from(ENC_KEY_B64, 'base64')) },
    ]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  for (const name of ENV_NAMES) {
    const value = ORIGINAL_ENV[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('/api/snaptrade handler', () => {
  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('GET');
  });

  it('reports a missing credential as a configuration fault, without naming the variable publicly', async () => {
    delete process.env.SNAPTRADE_CONSUMER_KEY;
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
    expect(JSON.stringify(res._body)).not.toMatch(/CONSUMER_KEY/);
  });

  it('still reads the SNAPTRADE_PERSONAL_* names a previous deployment was configured with', async () => {
    // The single-account demo's variables. Honouring them means this change
    // does not take a working deployment down until someone edits a dashboard.
    delete process.env.SNAPTRADE_CLIENT_ID;
    delete process.env.SNAPTRADE_CONSUMER_KEY;
    process.env.SNAPTRADE_PERSONAL_CLIENT_ID = 'legacy-client';
    process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY = 'legacy-key';
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    });
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(200);
    expect(seen[0]).toContain('clientId=legacy-client');
  });

  it('refuses a caller with no bearer token', async () => {
    upstream(async () => jsonResponse([]));
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(401);
    expect((res._body as { error: string }).error).toBe('unauthorized');
  });

  it('refuses a token Supabase does not recognise', async () => {
    supabaseUser = async () => jsonResponse({ msg: 'invalid JWT' }, 401);
    upstream(async () => jsonResponse([]));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(401);
  });

  it('does not report an unverifiable session as an expired one', async () => {
    // The distinction matters because the two ask different things of the
    // user: "sign in again" versus "try again". Collapsing them signs someone
    // out over a failed network hop.
    supabaseUser = async () => {
      throw new Error('ECONNRESET');
    };
    upstream(async () => jsonResponse([]));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('session_unavailable');
  });

  it('answers linked: false for a user who has connected nothing, without calling SnapTrade', async () => {
    snaptradeRow = async () => jsonResponse([]);
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    });
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ linked: false, accounts: [], connections: [], source: 'daily' });
    // Nothing to ask about: there is no user at SnapTrade to ask for.
    expect(seen).toEqual([]);
  });

  it('reports a stored secret that will not decrypt, rather than calling it "not connected"', async () => {
    // Answering "no account linked" here would invite the user to connect a
    // second brokerage on top of a live connection they still have.
    snaptradeRow = async () =>
      jsonResponse([{ snaptrade_user_id: AUTH_USER_ID, user_secret: 'v1.aaa.bbb.ccc' }]);
    upstream(async () => jsonResponse([]));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('link_unreadable');
  });

  it('distinguishes unparseable account rows from a user with no accounts', async () => {
    // Both used to answer {"accounts":[]}, which sent a reader looking for a
    // brokerage connection that was in fact already there.
    upstream(async () => jsonResponse([{ name: 'no id here' }]));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('returns an honest empty list when neither the daily cache nor any connection has an account', async () => {
    // No connections and no accounts: no brokerage linked at all.
    upstream(async () => jsonResponse([]));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(200);
    // connections: 0 is the diagnostic — SnapTrade sees no connection at all
    // for this key, which is a different fault from a connection whose
    // accounts have not synced yet.
    // source stays 'daily': with no connection to query there is no
    // real-time route to fall back to.
    expect(res._body).toMatchObject({ accounts: [], source: 'daily', connections: [] });
  });

  it('counts accounts per connection from what it returns, on the daily route too', async () => {
    // The daily route never runs the per-connection fan-out, and counting
    // that fan-out there produced a response claiming one account and
    // "this connection reported 0 accounts" at the same time.
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/authorizations')) return jsonResponse([CONNECTION]);
      if (url.includes('/positions/all')) return jsonResponse({ results: [] });
      if (url.includes('/api/v1/accounts?')) return jsonResponse([ACCOUNT]);
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    const body = res._body as {
      accounts: unknown[];
      source: string;
      connections: Array<{ accountCount: number }>;
    };
    expect(body.source).toBe('daily');
    expect(body.accounts).toHaveLength(1);
    expect(body.connections[0].accountCount).toBe(1);
  });

  it("never serves a disabled connection's accounts — SnapTrade keeps returning its last cached state", async () => {
    // The reason this matters: SnapTrade's docs say a disabled connection
    // "can no longer access the latest data from the brokerage, but will
    // continue to return the last available cached state". It answers 200
    // with holdings of entirely unknown age. Showing those as current is the
    // same lie as serving a stale screener snapshot, and here it is money.
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      seen.push(new URL(url).pathname);
      if (url.includes('/authorizations')) return jsonResponse([{ ...CONNECTION, disabled: true }]);
      if (url.includes('/api/v1/accounts?')) return jsonResponse([ACCOUNT]);
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);

    const body = res._body as { accounts: unknown[]; connections: Array<{ disabled: boolean }> };
    expect(body.accounts).toEqual([]);
    // Reported, not hidden: the screen says the connection is dead rather
    // than implying nothing was ever linked.
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].disabled).toBe(true);
    // And its holdings were never even requested.
    expect(seen.some((p) => p.includes('/positions') || p.includes('/balances'))).toBe(false);
  });

  it("keeps a live connection's accounts when a second connection is disabled", async () => {
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/authorizations')) {
        return jsonResponse([CONNECTION, { ...CONNECTION, id: 'conn-dead', disabled: true }]);
      }
      if (url.includes('/positions/all')) return jsonResponse({ results: [] });
      if (url.includes('/api/v1/accounts?')) {
        return jsonResponse([ACCOUNT, { ...ACCOUNT, id: 'acc-dead', brokerage_authorization: 'conn-dead' }]);
      }
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    const body = res._body as { accounts: Array<{ id: string }>; connections: unknown[] };
    expect(body.accounts.map((a) => a.id)).toEqual(['acc-1']);
    expect(body.connections).toHaveLength(2);
  });

  it('treats an unstated disabled flag as live rather than hiding a real account', async () => {
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/authorizations')) return jsonResponse([{ id: 'conn-1' }]);
      if (url.includes('/positions/all')) return jsonResponse({ results: [] });
      if (url.includes('/api/v1/accounts?')) return jsonResponse([ACCOUNT]);
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    expect((res._body as { accounts: unknown[] }).accounts).toHaveLength(1);
  });

  it('names the brokerage when a live connection reports no accounts', async () => {
    // The state the real IBKR connection is in: SnapTrade sees it, and the
    // brokerage returns an empty account list. Reporting that as "nothing
    // connected" sent us looking for a connection that already existed.
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/authorizations?')) {
        return jsonResponse([
          {
            id: 'conn-1',
            brokerage: { name: 'Interactive Brokers', display_name: 'Interactive Brokers' },
            disabled: false,
            type: 'read',
            data_freshness_mode: 'realtime',
          },
        ]);
      }
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(200);
    const body = res._body as { accounts: unknown[]; connections: Array<Record<string, unknown>> };
    expect(body.accounts).toEqual([]);
    expect(body.connections).toEqual([
      {
        id: 'conn-1',
        brokerage: 'Interactive Brokers',
        disabled: false,
        type: 'read',
        dataFreshnessMode: 'realtime',
        accountCount: 0,
      },
    ]);
  });

  it('drops a connection row with no id — it cannot be queried for accounts', async () => {
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/authorizations?')) return jsonResponse([{ brokerage: { name: 'Ghost' } }]);
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    expect(res._body).toMatchObject({ accounts: [], connections: [] });
  });

  it('falls back to the per-connection route when the daily cache is still empty', async () => {
    // /accounts is daily data, so a brokerage linked today answers [] there
    // while the connection is live. The account must still be found.
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      seen.push(new URL(url).pathname);
      if (url.includes('/api/v1/accounts?')) return jsonResponse([]);
      if (url.includes('/authorizations?')) return jsonResponse([{ id: 'conn-1' }]);
      if (url.includes('/authorizations/conn-1/accounts')) return jsonResponse([ACCOUNT]);
      if (url.includes('/positions/all')) return jsonResponse({ results: [] });
      return jsonResponse([]);
    });

    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(200);
    const body = res._body as { accounts: unknown[]; source: string };
    expect(body.accounts).toHaveLength(1);
    expect(body.source).toBe('realtime');
    expect(seen).toContain('/api/v1/authorizations');
    expect(seen).toContain('/api/v1/authorizations/conn-1/accounts');
  });

  it('reports an unreadable positions envelope instead of rendering a real account as holding nothing', async () => {
    // The regression this guards: /positions/all answers an object with a
    // results array. Reading it as a bare array silently yields zero
    // positions — invented emptiness, with no error anywhere.
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/positions/all')) return jsonResponse([{ instrument: { symbol: 'AAPL' } }]);
      if (url.includes('/balances')) return jsonResponse([]);
      return jsonResponse([ACCOUNT]);
    });

    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('fetches accounts, balances and positions and never touches a trading path', async () => {
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('/positions/all')) {
        return jsonResponse({
          results: [{ instrument: { kind: 'stock', symbol: 'AAPL' }, units: '2', price: '100' }],
          data_freshness: { as_of: '2026-08-28T14:30:00Z' },
        });
      }
      if (url.includes('/balances')) return jsonResponse([{ currency: { code: 'USD' }, cash: 42 }]);
      if (url.includes('/authorizations')) return jsonResponse([CONNECTION]);
      return jsonResponse([ACCOUNT]);
    });

    const res = makeRes();
    await handler(REQ, res);

    expect(res._status).toBe(200);
    const { accounts } = res._body as { accounts: Array<Record<string, unknown>> };
    expect(accounts).toHaveLength(1);
    expect(accounts[0].numberMasked).toBe('••4321');
    expect(accounts[0].positions).toEqual([
      {
        ticker: 'AAPL',
        description: null,
        units: 2,
        price: 100,
        marketValue: 200,
        avgCost: null,
        openPnl: null,
        currency: null,
      },
    ]);
    expect(accounts[0].asOf).toBe('2026-08-28T14:30:00Z');
    expect(seen).toHaveLength(4);
    // Asserted on the pathname, not the whole URL: the host itself contains
    // "trade", so matching the URL would pass vacuously.
    expect(seen.map((u) => new URL(u).pathname).sort()).toEqual([
      '/api/v1/accounts',
      '/api/v1/accounts/acc-1/balances',
      '/api/v1/accounts/acc-1/positions/all',
      '/api/v1/authorizations',
    ]);
    for (const url of seen) {
      expect(new URL(url).pathname).not.toMatch(/\/(trade|trading|orders)(\/|$)/i);
    }
  });

  it("carries the caller's own SnapTrade user, and never the consumer key, in the URL", async () => {
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    });

    await handler(REQ, makeRes());
    expect(seen[0]).toMatch(/clientId=demo-client&timestamp=\d+/);
    // The user pair is what scopes the read to one person. It comes from the
    // stored link, which came from the verified token.
    expect(seen[0]).toContain(`userId=${AUTH_USER_ID}`);
    expect(seen[0]).toContain(`userSecret=${USER_SECRET}`);
    // The consumer key only ever keys the signature; it never travels.
    expect(seen[0]).not.toContain('demo-key');
  });

  it('sends the signature as a header, not a query parameter', async () => {
    let init: RequestInit | undefined;
    upstream(async (_input: Parameters<typeof fetch>[0], i?: RequestInit) => {
      init = i;
      return jsonResponse([]);
    });

    await handler(REQ, makeRes());
    expect((init?.headers as Record<string, string>).Signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // The shared transport leaves the verb unset, which fetch defaults to
    // GET. What matters is that it is never a mutating one.
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('ignores caller-supplied query parameters — the upstream path is never caller-steered', async () => {
    const seen: string[] = [];
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    });

    await handler(
      { ...REQ, query: { path: '/trade/place-order', accountId: '../../evil', userId: 'someone-else' } },
      makeRes(),
    );
    // Two calls: the daily list, then the empty-cache fallback. Both are
    // paths from READ_ONLY_PATHS, neither carries anything the caller sent.
    expect(seen.map((u) => new URL(u).pathname)).toEqual(['/api/v1/authorizations', '/api/v1/accounts']);
    for (const url of seen) {
      // The userId is the one the token resolved to — NOT the 'someone-else'
      // the caller put in the query. That is the whole security property of
      // this route, asserted rather than assumed.
      expect(new URL(url).search).toBe(
        `?clientId=demo-client&timestamp=${new URL(url).searchParams.get('timestamp')}` +
          `&userId=${AUTH_USER_ID}&userSecret=${USER_SECRET}`,
      );
    }
  });

  it('maps a 401 to a credentials fault rather than an empty account list', async () => {
    upstream(async () => jsonResponse({ detail: 'bad signature' }, 401));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    // The shared upstream taxonomy, so this route reports a rejected key the
    // same way /api/news and /api/earnings do.
    expect((res._body as { error: string }).error).toBe('upstream_unauthorized');
    expect((res._body as { upstreamStatus: number }).upstreamStatus).toBe(401);
  });

  it('maps a 429 to a rate-limited error', async () => {
    upstream(async () => jsonResponse({}, 429));
    const res = makeRes();
    await handler(REQ, res);
    expect((res._body as { error: string }).error).toBe('upstream_rate_limited');
  });

  it('reports a network failure as unavailable instead of returning stale or invented holdings', async () => {
    upstream(async () => {
      throw new Error('ECONNRESET');
    });
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_unavailable');
    expect(res._body).not.toHaveProperty('accounts');
  });

  it('reports an unexpected upstream shape rather than guessing at it', async () => {
    upstream(async () => jsonResponse({ accounts: 'nope' }));
    const res = makeRes();
    await handler(REQ, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('times out a stalled upstream and reports it, with no success cache header', async () => {
    const slow = createHandler(10);
    upstream(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // A real fetch rejects with a DOMException named AbortError, which
          // is what the shared classifier keys on to tell a timeout from an
          // unreachable host — a plain Error would test the wrong branch.
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }) as Promise<Response>,
    );

    const res = makeRes();
    await slow(REQ, res);
    expect(res._status).toBe(502);
    // A timeout is reported as a timeout, not as an unreachable host — the
    // two are different operational facts.
    expect((res._body as { error: string }).error).toBe('upstream_timeout');
    expect(res._headers['Cache-Control']).toBe('private, no-store');
  });

  it('never lets a per-user response into a shared cache', async () => {
    upstream(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/positions/all')) return jsonResponse({ results: [] });
      if (url.includes('/authorizations')) return jsonResponse([CONNECTION]);
      if (url.includes('/api/v1/accounts?')) return jsonResponse([ACCOUNT]);
      return jsonResponse([]);
    });
    const res = makeRes();
    await handler(REQ, res);
    // The previous single-account demo could be cached at the edge because
    // everyone got the same answer. This one is one named person's holdings.
    expect(res._headers['Cache-Control']).toBe('private, no-store');
    expect(res._headers['Cache-Control']).not.toMatch(/public|s-maxage/);
  });
});
