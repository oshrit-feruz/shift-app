import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler } from '../news.js';
import { itMeetsTheFailureContract, makeRes } from './failureContract.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.EODHD_API_KEY;

beforeEach(() => {
  process.env.EODHD_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = ORIGINAL_KEY;
});

describe('handler', () => {
  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await handler({ method: 'POST', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('GET');
  });

  // An ABSENT ticker requests the general market feed; a PRESENT but
  // malformed one is still an error (asserted below). Conflating the two
  // would let a typo'd ticker silently serve unrelated market news as though
  // it were that stock's.
  it.each([
    ['omitted', {}],
    ['empty string', { ticker: '' }],
    ['whitespace only', { ticker: '   ' }],
  ])('serves the general market feed when the ticker is %s', async (_label, query) => {
    let seen = '';
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      seen = String(url);
      return Promise.resolve(new Response('[]', { status: 200 }));
    }) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._status).toBe(200);
    // `ticker: null` marks this as a feed response, so a client can tell it
    // from a per-stock one without inferring from its own request.
    expect(res._body).toMatchObject({ ticker: null });
    // The feed is EODHD's no-`s` call — 5 credits instead of 10, which is the
    // whole reason the browsable screen uses it rather than fanning out.
    expect(seen).not.toContain('s=');
    expect(seen).toContain('/api/news');
  });

  it('rejects an invalid ticker', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NV DA' } }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'invalid_ticker' });
  });

  it('reports misconfiguration when the API key is missing, without calling upstream', async () => {
    delete process.env.EODHD_API_KEY;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports upstream_unavailable on a network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_unavailable' });
  });

  it('reports upstream_error on an unclassified non-2xx upstream status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('upstream broke', { status: 503 }));
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_error' });
  });

  it('reports bad_response on unparseable JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not json{{{', { status: 200 }));
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  it('reports bad_response on a non-array body', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ oops: true }), { status: 200 }));
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  it('returns mapped articles on success, dropping a malformed row, and never leaks the API key', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: URL) => {
      capturedUrl = url.toString();
      return new Response(
        JSON.stringify([
          {
            title: 'NVIDIA lifts outlook',
            link: 'https://www.reuters.com/tech/nvidia',
            date: '2026-08-27T09:42:00+00:00',
            content: 'NVIDIA posted strong results. Analysts raised targets. Dropped sentence.',
            source: 'Reuters',
          },
          { title: 'Malformed row with no link' },
        ]),
        { status: 200 },
      );
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'nvda' } }, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      ticker: 'NVDA',
      articles: [
        {
          headline: 'NVIDIA lifts outlook',
          source: 'Reuters',
          publishedAt: '2026-08-27T09:42:00+00:00',
          summary: 'NVIDIA posted strong results. Analysts raised targets.',
          url: 'https://www.reuters.com/tech/nvidia',
          // Empty for a per-ticker response: the caller already knows the
          // stock, so there is nothing for the tags to disambiguate.
          symbols: [],
        },
      ],
    });
    expect(capturedUrl).toContain('s=NVDA.US');
    expect(capturedUrl).toContain('api_token=test-key');
    // The key must appear only in the server-side outbound request above —
    // never in anything sent back to whoever called this endpoint.
    expect(JSON.stringify(res._body)).not.toContain('test-key');
  });

  it('returns an empty list, not an error, when EODHD has no recent articles', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ticker: 'NVDA', articles: [] });
  });

  it('sets a short edge cache on a successful response, and none on a failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    const okRes = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, okRes);
    expect(okRes._headers['Cache-Control']).toBe('public, max-age=0, s-maxage=60');

    globalThis.fetch = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const errRes = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, errRes);
    expect(errRes._headers['Cache-Control']).toBeUndefined();
  });

  // Vercel's CDN caches a function response only when it carries an explicit
  // Cache-Control, so "no header" IS the no-cache mechanism. Asserting it on
  // every failure shape keeps a transient upstream hiccup from being frozen
  // and served to everyone for the TTL — the whole reason the cache is
  // success-only. Each failure mode is listed because they return from
  // different branches, and a later refactor could easily add a header to one.
  it.each([
    ['upstream 5xx', () => vi.fn().mockResolvedValue(new Response('nope', { status: 503 }))],
    ['upstream 429', () => vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }))],
    ['network failure', () => vi.fn().mockRejectedValue(new Error('boom'))],
    ['unparseable JSON', () => vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))],
    ['non-array body', () => vi.fn().mockResolvedValue(new Response('{"a":1}', { status: 200 }))],
  ])('never caches a failure: %s', async (_label, makeFetch) => {
    globalThis.fetch = makeFetch() as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBeGreaterThanOrEqual(500);
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  // The guard must run BEFORE the upstream call, not after: a rejected
  // request that still spends an EODHD call defeats the point of rejecting
  // it. The existing tests above assert the status code, which would keep
  // passing if the guard were moved below the fetch — so assert the absence
  // of the call itself, which is the property that actually protects quota.
  it.each([
    ['ticker with a space', { ticker: 'NV DA' }, 400],
    ['query-injection attempt', { ticker: 'NVDA&api_token=leak' }, 400],
    ['path-traversal attempt', { ticker: '../../etc/passwd' }, 400],
    ['absurdly long ticker', { ticker: 'A'.repeat(500) }, 400],
  ])('rejects %s without spending an upstream call', async (_label, query, status) => {
    process.env.EODHD_API_KEY = 'test-key'; // a valid key, so only the guard can stop it
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._status).toBe(status);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('rejects a repeated ticker parameter without spending an upstream call', async () => {
    // ?ticker=NVDA&ticker=BAD%20TICKER used to pass validation as NVDA and
    // reach upstream. A repeated parameter is ambiguous, not a value to pick
    // from — and an ambiguous request must not cost a credit.
    process.env.EODHD_API_KEY = 'test-key';
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: ['NVDA', 'BAD TICKER'] } }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'repeated_param' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('rejects a non-GET request without spending an upstream call', async () => {
    process.env.EODHD_API_KEY = 'test-key';
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'POST', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  itMeetsTheFailureContract(handler, createHandler, { ticker: 'NVDA' });

  it('reports a stalled body as a timeout, not as a malformed response', async () => {
    const shortHandler = createHandler(20);
    globalThis.fetch = vi.fn().mockImplementation(async (_url: URL, init?: { signal?: AbortSignal }) => {
      // fetch() itself resolves right away (headers "arrived"); only the body
      // read hangs, so this only passes if the timeout is wired through
      // upstreamRes.json() and not cleared as soon as fetch() resolves.
      return {
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      } as unknown as Response;
    });
    const res = makeRes();
    await shortHandler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    // The body may have been perfectly valid and merely too slow, so calling
    // it unreadable was a guess about a response we never saw.
    expect(res._body).toMatchObject({ error: 'upstream_timeout', timeoutMs: 20 });
  });

  it('still reports a genuinely malformed body as unreadable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    } as unknown as Response) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });
});
