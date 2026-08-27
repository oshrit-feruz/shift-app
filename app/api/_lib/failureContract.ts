import { expect, it, vi } from 'vitest';
import { type UpstreamFailure } from './upstream.js';

/**
 * The failure contract both API routes owe their callers, asserted from one
 * place instead of copied into each route's suite.
 *
 * These are the properties that make a failure actionable rather than merely
 * honest — which code, which upstream status, and never cached — and they
 * are identical for /api/news and /api/earnings by design. Two hand-copied
 * versions would let one route's guarantees quietly drift from the other's,
 * which is precisely the drift the contract exists to prevent.
 */

/** Records what a handler sent, standing in for Vercel's response object. */
export interface FakeRes {
  _status: number | undefined;
  _body: unknown;
  _headers: Record<string, string>;
  status(code: number): FakeRes;
  json(body: unknown): void;
  setHeader(k: string, v: string): void;
}

export function makeRes(): FakeRes {
  const res: FakeRes = {
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

type Handler = (req: { method?: string; query: Record<string, string | string[]> }, res: FakeRes) => Promise<unknown>;

/**
 * Registers the shared failure cases inside the caller's `describe`.
 *
 * `handler` is the route with its real budget; `makeShortHandler` builds the
 * same route with a millisecond budget so a timeout can be exercised without
 * waiting one out.
 */
export function itMeetsTheFailureContract(
  handler: Handler,
  makeShortHandler: (timeoutMs: number) => Handler,
  query: Record<string, string | string[]>,
): void {
  // 401/403 will not fix itself — the key or its plan has to change — while
  // 5xx probably will. One code for both told a reader to retry a problem no
  // amount of waiting resolves.
  it.each([
    [401, 'upstream_unauthorized'],
    [403, 'upstream_forbidden'],
    [429, 'upstream_rate_limited'],
    [500, 'upstream_error'],
  ])('reports upstream %i as %s, uncached', async (status, error) => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._status).toBe(502);
    // The provider's own status rides along, so one curl tells a plan
    // problem from an outage without reading server logs.
    expect(res._body).toMatchObject({ error, upstreamStatus: status });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('reports a provider that never answered as a timeout, with the budget', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: URL, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await makeShortHandler(20)({ method: 'GET', query }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_timeout', timeoutMs: 20 });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  // A provider that answered in 16 seconds and one we never reached are
  // different facts, and only the first has a budget to report.
  it('reports a provider it could not reach as unreachable, without a budget', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._body).toMatchObject({ error: 'upstream_unavailable' });
    expect((res._body as Partial<UpstreamFailure>).timeoutMs).toBeUndefined();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });
}
