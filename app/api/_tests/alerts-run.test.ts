import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, isScope, MAX_QUOTE_SYMBOLS } from '../alerts-run.js';
import { makeRes } from '../_lib/failureContract.js';

/**
 * The route's guards, which are the part of it that must hold before any
 * data is touched: only the scheduler may call it, only with a scope it
 * knows, and a deployment missing its configuration says so rather than
 * running half an engine.
 *
 * The deciding logic has its own suite (_lib/alerts.test.ts); what this one
 * proves is that an unauthenticated caller gets nothing — not a row, and
 * not a hint about what is configured.
 */

const ENV_KEYS = [
  'ALERTS_CRON_SECRET',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FINNHUB_API_KEY',
  'EODHD_API_KEY',
  'ALPHAVANTAGE_API_KEY',
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ALERTS_CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.FINNHUB_API_KEY = 'finnhub';
  process.env.EODHD_API_KEY = 'eodhd';
  process.env.ALPHAVANTAGE_API_KEY = 'av';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** A fetch that must never be reached: the guards fail before any I/O. */
const untouched = vi.fn(async () => {
  throw new Error('fetch must not be called');
}) as unknown as typeof fetch;

const call = (
  req: { method?: string; query: Record<string, string | string[]>; headers?: Record<string, string> },
  fetchImpl: typeof fetch = untouched,
) => {
  const res = makeRes();
  return createHandler(1_000, fetchImpl)(req, res).then(() => res);
};

const authed = { authorization: 'Bearer cron-secret' };

describe('isScope', () => {
  it('knows exactly the three scopes', () => {
    expect(isScope('prices')).toBe(true);
    expect(isScope('news')).toBe(true);
    expect(isScope('daily')).toBe(true);
    expect(isScope('all')).toBe(false);
    expect(isScope(undefined)).toBe(false);
  });
});

describe('alerts-run guards', () => {
  it('rejects anything but POST', async () => {
    const res = await call({ method: 'GET', query: { scope: 'prices' }, headers: authed });
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('POST');
  });

  it('refuses an unknown or missing scope', async () => {
    expect((await call({ method: 'POST', query: {}, headers: authed }))._status).toBe(400);
    expect((await call({ method: 'POST', query: { scope: 'everything' }, headers: authed }))._status).toBe(
      400,
    );
    expect(
      (await call({ method: 'POST', query: { scope: ['prices', 'news'] }, headers: authed }))._status,
    ).toBe(400);
  });

  it('refuses a caller without the secret, and one with the wrong secret', async () => {
    expect((await call({ method: 'POST', query: { scope: 'prices' } }))._status).toBe(401);
    const wrong = await call({
      method: 'POST',
      query: { scope: 'prices' },
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong._status).toBe(401);
    expect(wrong._body).toMatchObject({ error: 'unauthorized' });
    expect(untouched).not.toHaveBeenCalled();
  });

  it('with no secret configured, refuses everyone — there is nothing to compare against', async () => {
    delete process.env.ALERTS_CRON_SECRET;
    const res = await call({ method: 'POST', query: { scope: 'prices' }, headers: authed });
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
  });

  it('checks the secret BEFORE reporting missing configuration', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anon = await call({ method: 'POST', query: { scope: 'prices' } });
    expect(anon._status).toBe(401);
  });

  it.each([
    ['prices', 'FINNHUB_API_KEY'],
    ['news', 'EODHD_API_KEY'],
    ['daily', 'ALPHAVANTAGE_API_KEY'],
  ] as const)('the %s scope needs %s', async (scope, key) => {
    delete process.env[key];
    const res = await call({ method: 'POST', query: { scope }, headers: authed });
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
  });

  it('reports a database it cannot read as an upstream failure, uncached', async () => {
    const failing = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch;
    const res = await call({ method: 'POST', query: { scope: 'prices' }, headers: authed }, failing);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'db_error' });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('with nobody to evaluate, answers a zero run without calling any provider', async () => {
    const calls: string[] = [];
    const db = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input instanceof Request ? input.url : input));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const res = await call({ method: 'POST', query: { scope: 'news' }, headers: authed }, db);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ scope: 'news', users: 0, fired: 0 });
    expect(res._headers['Cache-Control']).toBe('no-store');
    expect(calls.every((u) => u.startsWith('https://project.supabase.co/'))).toBe(true);
  });

  it("bounds one run inside the quote provider's per-minute allowance", () => {
    expect(MAX_QUOTE_SYMBOLS).toBeLessThanOrEqual(60);
  });
});
