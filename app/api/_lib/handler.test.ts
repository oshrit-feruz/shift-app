import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler } from '../news.js';
import { itMeetsTheFailureContract, makeRes } from './failureContract.js';
import { clearTranslationMemo } from './translate.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.EODHD_API_KEY;
const ORIGINAL_DEEPL_KEY = process.env.DEEPL_API_KEY;

beforeEach(() => {
  process.env.EODHD_API_KEY = 'test-key';
  // Translation is opt-in per test: the default is a route with no translator
  // configured, which must behave exactly as it did before it had one.
  delete process.env.DEEPL_API_KEY;
  clearTranslationMemo();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DEEPL_KEY === undefined) delete process.env.DEEPL_API_KEY;
  else process.env.DEEPL_API_KEY = ORIGINAL_DEEPL_KEY;
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

/**
 * `?lang=he` translates the headline and excerpt, because the app is
 * Hebrew-first and EODHD's feed is English.
 *
 * The property under test throughout is that translation is a BEST-EFFORT
 * last step: whatever DeepL does, the caller still gets its real articles with
 * a 200. A secondary service must not be able to turn a successful news
 * response into an outage.
 */
describe('handler translation', () => {
  const ARTICLE = {
    title: 'NVIDIA lifts outlook',
    link: 'https://www.reuters.com/tech/nvidia',
    date: '2026-08-27T09:42:00+00:00',
    content: 'NVIDIA posted strong results.',
    source: 'Reuters',
  };

  /** EODHD answers the news call; DeepL answers anything aimed at its host. */
  function routed(deepl: (texts: string[]) => Response | Promise<Response>) {
    return vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).includes('deepl.com')) {
        return deepl(JSON.parse(String(init?.body)).text as string[]);
      }
      return new Response(JSON.stringify([ARTICLE]), { status: 200 });
    }) as unknown as typeof fetch;
  }

  const translateOk = (texts: string[]) =>
    new Response(JSON.stringify({ translations: texts.map((t) => ({ text: `HE:${t}` })) }), {
      status: 200,
    });

  it('returns Hebrew headline and summary, leaving the source and link untouched', async () => {
    process.env.DEEPL_API_KEY = 'deepl-key:fx';
    globalThis.fetch = routed(translateOk);
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA', lang: 'he' } }, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      articles: [
        {
          headline: 'HE:NVIDIA lifts outlook',
          summary: 'HE:NVIDIA posted strong results.',
          // A publisher's name and the link are facts, not copy: translating
          // them would corrupt real data rather than localise it.
          source: 'Reuters',
          url: 'https://www.reuters.com/tech/nvidia',
        },
      ],
    });
  });

  it('never leaks the DeepL key to the caller', async () => {
    process.env.DEEPL_API_KEY = 'deepl-secret:fx';
    globalThis.fetch = routed(translateOk);
    const res = makeRes();
    await handler({ method: 'GET', query: { lang: 'he' } }, res);
    expect(JSON.stringify(res._body)).not.toContain('deepl-secret');
  });

  it('does not call the translator at all for English', async () => {
    process.env.DEEPL_API_KEY = 'deepl-key:fx';
    const spy = routed(translateOk);
    globalThis.fetch = spy;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA', lang: 'en' } }, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ articles: [{ headline: 'NVIDIA lifts outlook' }] });
    expect(vi.mocked(spy).mock.calls.every(([url]) => !String(url).includes('deepl'))).toBe(true);
  });

  it('treats an absent lang as English, exactly as before translation existed', async () => {
    process.env.DEEPL_API_KEY = 'deepl-key:fx';
    const spy = routed(translateOk);
    globalThis.fetch = spy;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA' } }, res);
    expect(res._body).toMatchObject({ articles: [{ headline: 'NVIDIA lifts outlook' }] });
    expect(vi.mocked(spy).mock.calls.every(([url]) => !String(url).includes('deepl'))).toBe(true);
  });

  // The whole point of the fallback: real, current articles are still worth
  // showing in English. Answering 502 because a translator failed would hide
  // news that was fetched successfully.
  it.each([
    ['the translator errors', () => new Response('nope', { status: 500 })],
    ['the free quota is spent', () => new Response('quota', { status: 456 })],
    [
      'the translator answers a shape we cannot map',
      () => new Response(JSON.stringify({ translations: [] }), { status: 200 }),
    ],
  ])('serves the English articles with a 200 when %s', async (_label, deepl) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.DEEPL_API_KEY = 'deepl-key:fx';
    globalThis.fetch = routed(deepl);
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA', lang: 'he' } }, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ articles: [{ headline: 'NVIDIA lifts outlook' }] });
    expect(res._headers['Cache-Control']).toBe('public, max-age=0, s-maxage=60');
  });

  it('serves English, not a 500, when no DeepL key is configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Unlike a missing EODHD key, which is a 500: news without translation is
    // still news, so an unconfigured translator degrades instead of failing.
    const spy = routed(translateOk);
    globalThis.fetch = spy;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA', lang: 'he' } }, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ articles: [{ headline: 'NVIDIA lifts outlook' }] });
    expect(vi.mocked(spy).mock.calls.every(([url]) => !String(url).includes('deepl'))).toBe(true);
  });

  it.each([
    ['an unsupported language', { lang: 'fr' }],
    ['a nonsense value', { lang: 'he; DROP' }],
  ])('rejects %s without spending an upstream call', async (_label, query) => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'invalid_lang' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('rejects a repeated lang parameter, like a repeated ticker', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { lang: ['he', 'en'] } }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'repeated_param' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not call the translator when there is nothing to translate', async () => {
    process.env.DEEPL_API_KEY = 'deepl-key:fx';
    const spy = vi.fn(async (url: URL | string) => {
      if (String(url).includes('deepl.com')) throw new Error('should not be called');
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    globalThis.fetch = spy;
    const res = makeRes();
    await handler({ method: 'GET', query: { ticker: 'NVDA', lang: 'he' } }, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ticker: 'NVDA', articles: [] });
  });
});
