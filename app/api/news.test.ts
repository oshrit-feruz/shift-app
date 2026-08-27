import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { createHandler } from './news';

interface FakeResponse {
  _status: number | undefined;
  _body: unknown;
  _headers: Record<string, string>;
  status(code: number): FakeResponse;
  json(body: unknown): void;
  setHeader(k: string, v: string): void;
}

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

  it('requires a ticker', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'missing_ticker' });
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

  it('reports upstream_error on a non-2xx upstream status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
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
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ oops: true }), { status: 200 }));
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

  it('times out and reports bad_response if the body stalls past the budget', async () => {
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
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });
});
