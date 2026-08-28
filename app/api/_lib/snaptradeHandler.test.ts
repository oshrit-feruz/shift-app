import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler } from '../snaptrade.js';

interface FakeResponse {
  _status: number | undefined;
  _body: unknown;
  _headers: Record<string, string>;
  status(code: number): FakeResponse;
  json(body: unknown): void;
  setHeader(k: string, v: string): void;
}

/** Minimal stand-in for Vercel's response object, recording what the handler sends. */
function makeRes(): FakeResponse {
  const res: FakeResponse = {
    _status: undefined,
    _body: undefined,
    _headers: {},
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
    },
    setHeader(k, v) {
      res._headers[k] = v;
    },
  };
  return res;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  id: process.env.SNAPTRADE_PERSONAL_CLIENT_ID,
  key: process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY,
};

const ACCOUNT = {
  id: 'acc-1',
  name: 'Individual',
  number: '987654321',
  institution_name: 'Interactive Brokers',
  balance: { total: { amount: 1000, currency: 'USD' } },
};

beforeEach(() => {
  process.env.SNAPTRADE_PERSONAL_CLIENT_ID = 'demo-client';
  process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY = 'demo-key';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  for (const [name, value] of [
    ['SNAPTRADE_PERSONAL_CLIENT_ID', ORIGINAL_ENV.id],
    ['SNAPTRADE_PERSONAL_CONSUMER_KEY', ORIGINAL_ENV.key],
  ] as const) {
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
    delete process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
    expect(JSON.stringify(res._body)).not.toMatch(/CONSUMER_KEY/);
  });

  it('distinguishes unparseable account rows from a user with no accounts', async () => {
    // Both used to answer {"accounts":[]}, which sent a reader looking for a
    // brokerage connection that was in fact already there.
    globalThis.fetch = vi.fn(async () => jsonResponse([{ name: 'no id here' }])) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('returns an honest empty list when no brokerage is connected yet', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ accounts: [] });
  });

  it('fetches accounts, balances and positions and never touches a trading path', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('/positions')) {
        return jsonResponse([{ symbol: { symbol: { symbol: 'AAPL' } }, units: 2, price: 100 }]);
      }
      if (url.includes('/balances')) return jsonResponse([{ currency: { code: 'USD' }, cash: 42 }]);
      return jsonResponse([ACCOUNT]);
    }) as unknown as typeof fetch;

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

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
    expect(seen).toHaveLength(3);
    // Asserted on the pathname, not the whole URL: the host itself contains
    // "trade", so matching the URL would pass vacuously.
    expect(seen.map((u) => new URL(u).pathname).sort()).toEqual([
      '/api/v1/accounts',
      '/api/v1/accounts/acc-1/balances',
      '/api/v1/accounts/acc-1/positions',
    ]);
    for (const url of seen) {
      expect(new URL(url).pathname).not.toMatch(/\/(trade|orders|options)(\/|$)/i);
    }
  });

  it('never sends userId or userSecret, and never leaks the consumer key into the URL', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await handler({ method: 'GET', query: {} }, makeRes());
    expect(seen[0]).toMatch(/clientId=demo-client&timestamp=\d+/);
    expect(seen[0]).not.toMatch(/userId|userSecret|demo-key/);
  });

  it('sends the signature as a header, not a query parameter', async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_input: Parameters<typeof fetch>[0], i?: RequestInit) => {
      init = i;
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await handler({ method: 'GET', query: {} }, makeRes());
    expect((init?.headers as Record<string, string>).Signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // The shared transport leaves the verb unset, which fetch defaults to
    // GET. What matters is that it is never a mutating one.
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('ignores caller-supplied query parameters — the upstream path is never caller-steered', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await handler({ method: 'GET', query: { path: '/trade/place-order', accountId: '../../evil' } }, makeRes());
    expect(seen).toEqual([expect.stringContaining('https://api.snaptrade.com/api/v1/accounts?clientId=')]);
  });

  it('maps a 401 to a credentials fault rather than an empty account list', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ detail: 'bad signature' }, 401)) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(502);
    // The shared upstream taxonomy, so this route reports a rejected key the
    // same way /api/news and /api/earnings do.
    expect((res._body as { error: string }).error).toBe('upstream_unauthorized');
    expect((res._body as { upstreamStatus: number }).upstreamStatus).toBe(401);
  });

  it('maps a 429 to a rate-limited error', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect((res._body as { error: string }).error).toBe('upstream_rate_limited');
  });

  it('reports a network failure as unavailable instead of returning stale or invented holdings', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_unavailable');
    expect(res._body).not.toHaveProperty('accounts');
  });

  it('reports an unexpected upstream shape rather than guessing at it', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ accounts: 'nope' })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('times out a stalled upstream and reports it, with no success cache header', async () => {
    const slow = createHandler(10);
    globalThis.fetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // A real fetch rejects with a DOMException named AbortError, which
          // is what the shared classifier keys on to tell a timeout from an
          // unreachable host — a plain Error would test the wrong branch.
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    const res = makeRes();
    await slow({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(502);
    // A timeout is reported as a timeout, not as an unreachable host — the
    // two are different operational facts.
    expect((res._body as { error: string }).error).toBe('upstream_timeout');
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('caches a successful response briefly, without stale-while-revalidate', async () => {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) =>
      jsonResponse(String(input).includes('/accounts?') ? [ACCOUNT] : []),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._headers['Cache-Control']).toBe('public, max-age=0, s-maxage=60');
    expect(res._headers['Cache-Control']).not.toMatch(/stale-while-revalidate/);
  });
});
