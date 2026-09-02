import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, isBoard } from './movers.js';
import { makeRes } from './_lib/failureContract.js';

/**
 * The route behind the market-movers board. What matters here: the filters
 * actually reach the provider (an unfiltered board is the one failure that
 * looks like success), the board is labelled as the last close's, and an
 * empty board is an answer rather than an error.
 */

const row = {
  code: 'MRNA',
  name: 'Moderna Inc',
  last_day_data_date: '2026-09-01',
  adjusted_close: 154.27,
  refund_1d_p: 9.93,
  sector: 'Healthcare',
  avgvol_1d: 25690832,
  avgvol_200d: 11319266.03,
};
const okBody = { data: [row] };

const respond = (body: unknown, status = 200) =>
  vi.fn(
    async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response,
  ) as unknown as typeof fetch;

const call = async (query: Record<string, string | string[]>, fetchImpl: typeof fetch) => {
  const res = makeRes();
  await createHandler(1_000, fetchImpl)({ method: 'GET', query }, res);
  return res;
};

/** The URL the handler actually asked for. */
const requestedUrl = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0];

beforeEach(() => {
  vi.stubEnv('EODHD_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isBoard', () => {
  it('accepts the three boards and nothing else', () => {
    expect(isBoard('gainers')).toBe(true);
    expect(isBoard('losers')).toBe(true);
    expect(isBoard('active')).toBe(true);
    expect(isBoard('toString')).toBe(false);
    expect(isBoard('')).toBe(false);
    expect(isBoard(undefined)).toBe(false);
  });
});

describe('/api/movers', () => {
  it('serves the mapped board, said to be the last close and not the running day', async () => {
    const res = await call({ board: 'gainers' }, respond(okBody));
    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      board: 'gainers',
      source: 'eodhd:screener',
      lastClose: true,
      rows: [
        {
          ticker: 'MRNA',
          name: 'Moderna Inc',
          sector: 'Healthcare',
          close: 154.27,
          changePct: 9.93,
          volume: 25690832,
          averageVolume: 11319266.03,
        },
      ],
    });
  });

  it('carries no date, however plainly the provider dates the session', async () => {
    // The row arrives with `last_day_data_date`. The screen says "the last
    // market close" rather than naming a day, so nothing here carries one.
    const res = await call({ board: 'gainers' }, respond(okBody));
    expect(JSON.stringify(res._body)).not.toContain('2026-09-01');
  });

  it('sends the floors that make the board readable', async () => {
    // Without these the top of the gainers board is a sub-penny OTC listing
    // whose one-cent tick is a double-digit percentage move. The filters are
    // the feature, so their absence is a test failure, not a detail.
    const fetchImpl = respond(okBody);
    await call({ board: 'gainers' }, fetchImpl);
    const filters: unknown = JSON.parse(requestedUrl(fetchImpl).searchParams.get('filters')!);
    expect(filters).toEqual([
      ['exchange', '=', 'us'],
      ['market_capitalization', '>', 5_000_000_000],
      ['adjusted_close', '>', 10],
      ['avgvol_1d', '>', 2_000_000],
    ]);
  });

  it('ranks each board on its own field, in its own direction', async () => {
    const sortFor = async (board: string) => {
      const fetchImpl = respond(okBody);
      await call({ board }, fetchImpl);
      return requestedUrl(fetchImpl).searchParams.get('sort');
    };
    expect(await sortFor('gainers')).toBe('refund_1d_p.desc');
    expect(await sortFor('losers')).toBe('refund_1d_p.asc');
    expect(await sortFor('active')).toBe('avgvol_1d.desc');
  });

  it('asks for the whole hundred the provider allows', async () => {
    const fetchImpl = respond(okBody);
    await call({ board: 'gainers' }, fetchImpl);
    expect(requestedUrl(fetchImpl).searchParams.get('limit')).toBe('100');
  });

  it('reads an empty board as a real answer, not as a failure', async () => {
    const res = await call({ board: 'losers' }, respond({ data: [] }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ rows: [] });
  });

  it('drops a row it cannot render without losing the rest of the board', async () => {
    // Unlike a chart, a board is a list: one unusable entry costs the reader
    // that row, not a picture of the market that never happened.
    const res = await call({ board: 'gainers' }, respond({ data: [row, { code: 'ZZ' }] }));
    expect(res._status).toBe(200);
    expect((res._body as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('reports an unreadable body rather than an empty board', async () => {
    const res = await call({ board: 'gainers' }, respond({ error: 'nope' }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('reports a plan problem as a plan problem', async () => {
    const res = await call({ board: 'gainers' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('validates the board before spending an upstream call', async () => {
    const fetchImpl = respond(okBody);
    const res = await call({ board: 'everything' }, fetchImpl);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('invalid_board');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ board: ['gainers', 'losers'] }, respond(okBody));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('caches a success for half an hour and a failure not at all', async () => {
    expect((await call({ board: 'gainers' }, respond(okBody)))._headers['Cache-Control']).toContain(
      's-maxage=1800',
    );
    expect((await call({ board: 'gainers' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    const res = await call({ board: 'gainers' }, respond(okBody));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(okBody))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
