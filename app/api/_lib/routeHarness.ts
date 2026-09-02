import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeRes, type FakeRes } from './failureContract.js';

/**
 * The scaffolding every EODHD route's suite needs, in one place.
 *
 * Four suites — candles, intraday, movers, stats — opened with the same
 * twenty-odd lines: a fetch stub built from a body and a status, a helper that
 * runs the handler against a fake response, a reader for the URL the handler
 * actually asked for, and the env stubbing that gives it a key. Identical
 * apart from the handler each one imports.
 *
 * Shared for the same reason `itMeetsTheFailureContract` in failureContract.ts
 * is: what these helpers encode is the shape of a route call, and four hand-
 * maintained copies of it drift. It lives under `_lib` because a leading
 * underscore is Vercel's own convention for a path under `api/` that is not an
 * endpoint — see api/_tests/README.md for why that matters here.
 */

/** A handler as the suites call it: a fake request in, a recorded response out. */
export type RouteHandler = (
  req: { method?: string; query: Record<string, string | string[]> },
  res: FakeRes,
) => Promise<unknown>;

/**
 * A fetch that always answers with `body` and `status`.
 *
 * Returned as a vi.fn so a caller can assert on what was requested, and cast
 * to `typeof fetch` because the routes take one — the stub answers only the
 * parts of Response the upstream reader touches.
 */
export function respondWith(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response,
  ) as unknown as typeof fetch;
}

/** Run one GET through a handler and return what it sent. */
export async function callRoute(
  handler: RouteHandler,
  query: Record<string, string | string[]>,
): Promise<FakeRes> {
  const res = makeRes();
  await handler({ method: 'GET', query }, res);
  return res;
}

/** The URL the handler actually asked upstream for. */
export function requestedUrl(fetchImpl: typeof fetch): URL {
  return (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0];
}

/**
 * Give the suite a server key for the length of each test.
 *
 * Called at describe scope; a test that wants the missing-key case stubs an
 * empty value over it, which this then unstubs like any other.
 */
export function withServerKey(name: string, value = 'test-key'): void {
  beforeEach(() => {
    vi.stubEnv(name, value);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
}

/**
 * The two answers every one of these routes owes regardless of its subject,
 * registered inside the caller's `describe`.
 *
 * A missing server key is 500 `not_configured` — a fact about this
 * deployment, deliberately not dressed up as a provider failure the reader
 * could retry — and anything but GET is 405. Every suite asserted both, in the
 * same eleven lines, differing only in which query keeps the handler happy.
 *
 * `makeHandler` builds the route with an injected fetch; `query` is a valid
 * one for it; `envName` is the key it reads.
 */
export function itAnswersTheRouteBasics(
  makeHandler: (fetchImpl: typeof fetch) => RouteHandler,
  query: Record<string, string | string[]>,
  envName: string,
  okFetch: typeof fetch,
): void {
  it('says so plainly when the server has no key', async () => {
    vi.stubEnv(envName, '');
    const res = await callRoute(makeHandler(okFetch), query);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await makeHandler(okFetch)({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
}
