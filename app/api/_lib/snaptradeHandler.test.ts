import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler, returnTo } from '../snaptrade.js';
// The response stand-in is the shared one the other route suites use —
// a local copy of it was 28 duplicated lines for no benefit.
import { makeRes } from './failureContract.js';

/**
 * The per-user brokerage route. Three groups of cases matter here:
 *
 *   * WHO — the person acted on comes from a verified access token, and their
 *     SnapTrade credentials from a table only the server reads. A caller must
 *     not be able to reach anyone else's brokerage by any means.
 *   * WHAT IS SAFE TO SHOW — a disabled connection's cached holdings never
 *     are, an unreadable response is never an empty account, and no trading
 *     path is ever touched.
 *   * WHAT THE SECRET COSTS — SnapTrade issues it once, so a registration we
 *     fail to store is undone rather than left orphaned.
 */

const VERIFIED_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const SNAP_USER = `shift-${VERIFIED_ID}`;
const CONNECTION_ID = '8b5f262d-4bb9-365d-888a-202bd3b15fa1';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  clientId: process.env.SNAPTRADE_CLIENT_ID,
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const CONNECTION = {
  id: CONNECTION_ID,
  brokerage: { name: 'Interactive Brokers', display_name: 'Interactive Brokers' },
  disabled: false,
  type: 'read',
  data_freshness_mode: 'realtime',
};

const ACCOUNT = {
  id: 'acc-1',
  brokerage_authorization: CONNECTION_ID,
  name: 'Individual',
  number: '987654321',
  institution_name: 'Interactive Brokers',
  balance: { total: { amount: 1000, currency: 'USD' } },
};

const POSITIONS = { results: [], data_freshness: { as_of: '2026-09-03T12:00:00Z' } };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/**
 * What each upstream leg answers, chosen per test.
 *
 * Routed by URL rather than by call order: the handler makes a different
 * number of calls per method, and a positional mock would then encode the
 * call order into every unrelated test.
 */
interface Upstream {
  /** The token check. 'ok' identifies VERIFIED_ID; 'dead' is a 401. */
  who?: 'ok' | 'dead' | 'throws';
  /** What the identity table holds. */
  identity?: 'linked' | 'none' | 'unreadable';
  /** Whether writing a new identity succeeds. */
  writeOk?: boolean;
  connections?: unknown;
  accounts?: unknown;
  connectionAccounts?: unknown;
  positions?: unknown;
  balances?: unknown;
  register?: unknown;
  login?: unknown;
  /** Force a status on every api.snaptrade.com call. */
  snapStatus?: number;
  snapThrows?: boolean;
}

function mockUpstream(up: Upstream = {}): Call[] {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response);

  globalThis.fetch = vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    if (url.endsWith('/auth/v1/user')) {
      if (up.who === 'throws') return Promise.reject(new Error('network'));
      if (up.who === 'dead') return json({}, 401);
      return json({ id: VERIFIED_ID });
    }
    if (url.includes('/rest/v1/snaptrade_users')) {
      if (init?.method === 'POST') return json({}, up.writeOk === false ? 500 : 201);
      if (up.identity === 'unreadable') return json({}, 500);
      const rows =
        (up.identity ?? 'linked') === 'linked'
          ? [{ snaptrade_user_id: SNAP_USER, user_secret: 'the-secret' }]
          : [];
      return json(rows);
    }
    if (url.includes('api.snaptrade.com')) {
      if (up.snapThrows) return Promise.reject(new Error('network'));
      if (up.snapStatus) return json({}, up.snapStatus);
      if (url.includes('/snapTrade/registerUser')) {
        return json(up.register ?? { userId: SNAP_USER, userSecret: 'fresh-secret' });
      }
      if (url.includes('/snapTrade/login')) {
        return json(up.login ?? { redirectURI: 'https://app.snaptrade.com/snapTrade/redeemToken?token=x' });
      }
      if (url.includes('/snapTrade/deleteUser')) return json({});
      if (url.includes('/api/v1/connection/')) return json({});
      if (url.includes('/authorizations/') && url.includes('/accounts')) {
        return json(up.connectionAccounts ?? []);
      }
      if (url.includes('/api/v1/authorizations')) return json(up.connections ?? [CONNECTION]);
      if (url.includes('/positions/all')) return json(up.positions ?? POSITIONS);
      if (url.includes('/balances')) return json(up.balances ?? []);
      if (url.includes('/api/v1/accounts')) return json(up.accounts ?? [ACCOUNT]);
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return calls;
}

const authed = { query: {}, headers: { authorization: 'Bearer tok' } };
const call = (
  req: { method?: string; query?: Record<string, string | string[]>; headers?: Record<string, string> },
  timeoutMs = 1_000,
) => {
  const res = makeRes();
  return createHandler(timeoutMs)({ ...authed, ...req, query: req.query ?? {} }, res).then(() => res);
};

beforeEach(() => {
  process.env.SNAPTRADE_CLIENT_ID = 'client-id';
  process.env.SNAPTRADE_CONSUMER_KEY = 'consumer-key';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  for (const [name, value] of [
    ['SNAPTRADE_CLIENT_ID', ORIGINAL_ENV.clientId],
    ['SNAPTRADE_CONSUMER_KEY', ORIGINAL_ENV.consumerKey],
    ['SUPABASE_URL', ORIGINAL_ENV.url],
    ['SUPABASE_SERVICE_ROLE_KEY', ORIGINAL_ENV.serviceKey],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('/api/snaptrade — who is asking', () => {
  it('rejects a method it does not serve', async () => {
    const res = makeRes();
    await handler({ method: 'PUT', query: {} }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('GET, POST, DELETE');
  });

  it('reports a missing credential as a configuration fault, without naming the variable publicly', async () => {
    delete process.env.SNAPTRADE_CONSUMER_KEY;
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
    expect(JSON.stringify(res._body)).not.toContain('SNAPTRADE');
  });

  it.each([
    ['no header', {}],
    ['wrong scheme', { authorization: 'Basic abc' }],
    ['empty token', { authorization: 'Bearer   ' }],
  ])('refuses a request with %s rather than serving anybody', async (_label, headers) => {
    mockUpstream();
    const res = await call({ method: 'GET', headers });
    expect(res._status).toBe(401);
  });

  it('refuses a token the auth server does not recognise', async () => {
    mockUpstream({ who: 'dead' });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(401);
  });

  it('separates an unreachable auth server from an expired session', async () => {
    mockUpstream({ who: 'throws' });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_unreachable' });
  });

  // The security property of this route: the person read comes from the
  // verified token, never from anything the caller sent.
  it('ignores a user id supplied by the caller', async () => {
    const calls = mockUpstream();
    const res = await call({
      method: 'GET',
      query: { userId: 'shift-victim', userSecret: 'stolen', user_id: 'victim' },
    });
    expect(res._status).toBe(200);
    const upstream = calls.filter((c) => c.url.includes('api.snaptrade.com'));
    expect(upstream.length).toBeGreaterThan(0);
    for (const c of upstream) {
      expect(c.url).toContain(encodeURIComponent(SNAP_USER));
      expect(c.url).not.toContain('victim');
      expect(c.url).not.toContain('stolen');
    }
  });

  it('sends the caller’s own credentials, and never the consumer key, upstream', async () => {
    const calls = mockUpstream();
    await call({ method: 'GET' });
    const first = calls.find((c) => c.url.includes('api.snaptrade.com'))!;
    expect(first.url).toContain('clientId=client-id');
    expect(first.url).toContain(`userId=${encodeURIComponent(SNAP_USER)}`);
    expect(first.url).toContain('userSecret=the-secret');
    expect(first.url).not.toContain('consumer-key');
    // The signature is a header, not a query parameter.
    expect(first.headers.Signature).toEqual(expect.any(String));
    expect(first.url).not.toContain('Signature');
  });

  it('never lets the stored secret reach the response body', async () => {
    mockUpstream();
    const res = await call({ method: 'GET' });
    expect(JSON.stringify(res._body)).not.toContain('the-secret');
  });
});

describe('/api/snaptrade GET — reading accounts', () => {
  it('answers an honest empty list for someone who has never linked, and registers nobody', async () => {
    // Reading your accounts must not create an account at a third party.
    const calls = mockUpstream({ identity: 'none' });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ accounts: [], connections: [], source: 'daily' });
    expect(calls.some((c) => c.url.includes('api.snaptrade.com'))).toBe(false);
  });

  it('reports an unreadable identity rather than an empty account list', async () => {
    mockUpstream({ identity: 'unreadable' });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'identity_unreadable' });
  });

  it('fetches accounts, balances and positions and never touches a trading path', async () => {
    const calls = mockUpstream();
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(200);
    const paths = calls.filter((c) => c.url.includes('api.snaptrade.com')).map((c) => c.url);
    expect(paths.some((p) => p.includes('/api/v1/authorizations?'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/v1/accounts?'))).toBe(true);
    expect(paths.some((p) => p.includes('/accounts/acc-1/balances'))).toBe(true);
    expect(paths.some((p) => p.includes('/accounts/acc-1/positions/all'))).toBe(true);
    for (const p of paths) {
      expect(p).not.toMatch(/\/trade|\/orders/);
    }
    // Every read is a GET.
    for (const c of calls.filter((x) => x.url.includes('api.snaptrade.com'))) {
      expect(c.method).toBe('GET');
    }
  });

  it('masks the account number and carries the freshness stamp', async () => {
    mockUpstream();
    const res = await call({ method: 'GET' });
    const body = res._body as { accounts: Array<{ numberMasked: string; asOf: string; source: string }> };
    expect(body.accounts[0].numberMasked).toBe('••4321');
    expect(body.accounts[0].asOf).toBe('2026-09-03T12:00:00Z');
    expect(body.accounts[0].source).toBe('daily');
  });

  it("never serves a disabled connection's accounts — SnapTrade keeps returning its last cached state", async () => {
    mockUpstream({ connections: [{ ...CONNECTION, disabled: true }] });
    const res = await call({ method: 'GET' });
    const body = res._body as { accounts: unknown[]; connections: Array<{ disabled: boolean }> };
    expect(body.accounts).toEqual([]);
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].disabled).toBe(true);
  });

  it('treats an unstated disabled flag as live rather than hiding a real account', async () => {
    mockUpstream({ connections: [{ ...CONNECTION, disabled: 'maybe' }] });
    const res = await call({ method: 'GET' });
    expect((res._body as { accounts: unknown[] }).accounts).toHaveLength(1);
  });

  it('names the brokerage when a live connection reports no accounts', async () => {
    mockUpstream({ accounts: [], connectionAccounts: [] });
    const res = await call({ method: 'GET' });
    const body = res._body as {
      accounts: unknown[];
      connections: Array<{ brokerage: string; accountCount: number }>;
    };
    expect(body.accounts).toEqual([]);
    expect(body.connections[0]).toMatchObject({ brokerage: 'Interactive Brokers', accountCount: 0 });
  });

  it('falls back to the per-connection route when the daily cache is still empty', async () => {
    const calls = mockUpstream({ accounts: [], connectionAccounts: [ACCOUNT] });
    const res = await call({ method: 'GET' });
    expect((res._body as { source: string }).source).toBe('realtime');
    expect(calls.some((c) => c.url.includes(`/authorizations/${CONNECTION_ID}/accounts`))).toBe(true);
  });

  it('distinguishes unparseable account rows from a user with no accounts', async () => {
    mockUpstream({ accounts: [{ name: 'no id here' }] });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  it('reports an unreadable positions envelope instead of rendering a real account as holding nothing', async () => {
    mockUpstream({ positions: [] });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  it('maps a 401 to a credentials fault rather than an empty account list', async () => {
    mockUpstream({ snapStatus: 401 });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_unauthorized' });
  });

  it('maps a 429 to a rate-limited error', async () => {
    mockUpstream({ snapStatus: 429 });
    const res = await call({ method: 'GET' });
    expect(res._body).toMatchObject({ error: 'upstream_rate_limited' });
  });

  it('reports a network failure as unavailable instead of returning invented holdings', async () => {
    mockUpstream({ snapThrows: true });
    const res = await call({ method: 'GET' });
    expect(res._status).toBe(502);
    expect(JSON.stringify(res._body)).not.toContain('accounts');
  });

  // One person's money must never sit in a shared cache.
  it('is never cached beyond the caller', async () => {
    mockUpstream();
    const res = await call({ method: 'GET' });
    expect(res._headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('/api/snaptrade POST — the connection portal', () => {
  it('returns the portal link for someone already registered', async () => {
    const calls = mockUpstream();
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ redirectUri: expect.stringContaining('https://') });
    expect(calls.some((c) => c.url.includes('/snapTrade/registerUser'))).toBe(false);
  });

  it('asks for a READ connection — the app can never place an order', async () => {
    const calls = mockUpstream();
    await call({ method: 'POST' });
    const login = calls.find((c) => c.url.includes('/snapTrade/login'))!;
    expect(login.method).toBe('POST');
    expect(JSON.parse(login.body!)).toMatchObject({ connectionType: 'read' });
  });

  it('signs the body it sends, or SnapTrade would refuse it', async () => {
    const calls = mockUpstream();
    await call({ method: 'POST' });
    const login = calls.find((c) => c.url.includes('/snapTrade/login'))!;
    expect(login.headers.Signature).toEqual(expect.any(String));
    expect(login.headers['Content-Type']).toBe('application/json');
    // A GET on the same route signs a null body, so the two must differ.
    const get = calls.find((c) => c.url.includes('/api/v1/authorizations'));
    if (get) expect(get.headers.Signature).not.toBe(login.headers.Signature);
  });

  it('registers a first-time user and stores the secret before using it', async () => {
    const calls = mockUpstream({ identity: 'none' });
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(200);
    const register = calls.findIndex((c) => c.url.includes('/snapTrade/registerUser'));
    const store = calls.findIndex((c) => c.url.includes('/rest/v1/snaptrade_users') && c.method === 'POST');
    const login = calls.findIndex((c) => c.url.includes('/snapTrade/login'));
    expect(register).toBeGreaterThanOrEqual(0);
    expect(store).toBeGreaterThan(register);
    expect(login).toBeGreaterThan(store);
    // Registration names the person by their verified id, and carries no
    // user credentials of its own — there are none yet.
    expect(JSON.parse(calls[register].body!)).toEqual({ userId: SNAP_USER });
    expect(calls[register].url).not.toContain('userSecret');
  });

  it('undoes a registration whose secret it could not store', async () => {
    // The secret exists only in that one response. Left in place, the
    // SnapTrade user would be unreachable forever.
    const calls = mockUpstream({ identity: 'none', writeOk: false });
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'identity_not_saved' });
    const undo = calls.find((c) => c.url.includes('/snapTrade/deleteUser'));
    expect(undo?.method).toBe('DELETE');
    expect(calls.some((c) => c.url.includes('/snapTrade/login'))).toBe(false);
  });

  it('never registers a second user because the lookup failed', async () => {
    const calls = mockUpstream({ identity: 'unreadable' });
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'identity_unreadable' });
    expect(calls.some((c) => c.url.includes('/snapTrade/registerUser'))).toBe(false);
  });

  it('refuses a portal response with no usable URL', async () => {
    mockUpstream({ login: { redirectURI: 'javascript:alert(1)' } });
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  it('refuses a registration response with no secret', async () => {
    mockUpstream({ identity: 'none', register: { userId: SNAP_USER } });
    const res = await call({ method: 'POST' });
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });
});

describe('/api/snaptrade DELETE — removing a connection', () => {
  it('removes a connection the caller owns, and says it was only queued', async () => {
    const calls = mockUpstream();
    const res = await call({ method: 'DELETE', query: { connectionId: CONNECTION_ID } });
    expect(res._status).toBe(200);
    // Asynchronous upstream: queued is what we know, so queued is what we say.
    expect(res._body).toEqual({ queued: true });
    const del = calls.find((c) => c.url.includes(`/api/v1/connection/${CONNECTION_ID}`));
    expect(del?.method).toBe('DELETE');
  });

  it('refuses a connection that is not the caller’s', async () => {
    const calls = mockUpstream({
      connections: [{ ...CONNECTION, id: 'ffffffff-0000-0000-0000-000000000000' }],
    });
    const res = await call({ method: 'DELETE', query: { connectionId: CONNECTION_ID } });
    expect(res._status).toBe(404);
    expect(res._body).toMatchObject({ error: 'not_connected' });
    expect(calls.some((c) => c.url.includes('/api/v1/connection/'))).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['not an id', 'nope'],
    ['a path of its own', '../snapTrade/deleteUser'],
  ])('refuses a connection id that is %s', async (_label, connectionId) => {
    mockUpstream();
    const res = await call({
      method: 'DELETE',
      query: connectionId === undefined ? {} : { connectionId },
    });
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'invalid_connection' });
  });

  it('has nothing to remove for someone who never linked one', async () => {
    mockUpstream({ identity: 'none' });
    const res = await call({ method: 'DELETE', query: { connectionId: CONNECTION_ID } });
    expect(res._status).toBe(404);
    expect(res._body).toMatchObject({ error: 'not_connected' });
  });
});

describe('returnTo', () => {
  it('is the requesting origin, so a preview deployment comes back to itself', () => {
    expect(returnTo({ query: {}, headers: { origin: 'https://shift-app.vercel.app' } })).toBe(
      'https://shift-app.vercel.app',
    );
  });

  it('is empty for anything that is not a plain https origin', () => {
    // Handed to a third party as a redirect target, so a caller must not be
    // able to choose where the person lands.
    for (const origin of [
      'http://evil.example',
      'https://evil.example/path?x=1',
      'javascript:alert(1)',
      '',
      undefined,
    ]) {
      expect(returnTo({ query: {}, headers: origin === undefined ? {} : { origin } })).toBe('');
    }
  });
});
