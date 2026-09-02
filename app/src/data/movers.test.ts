import { describe, expect, it, vi } from 'vitest';
import { extractBoard, fetchMovers } from './movers';

const row = {
  ticker: 'MRNA',
  name: 'Moderna Inc',
  sector: 'Healthcare',
  close: 154.27,
  changePct: 9.93,
  volume: 25690832,
  averageVolume: 11319266.03,
};
const body = { board: 'gainers', source: 'eodhd:screener', lastClose: true, rows: [row] };

const respond = (payload: unknown, ok = true) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status: ok ? 200 : 502, json: async () => payload }) as unknown as Response,
  );

describe('extractBoard', () => {
  it('maps the route payload', () => {
    expect(extractBoard(body)).toEqual({ board: 'gainers', lastClose: true, rows: [row] });
  });

  it('reads an empty board as a real answer — nothing cleared the filters', () => {
    expect(extractBoard({ ...body, rows: [] })).toEqual({
      board: 'gainers',
      lastClose: true,
      rows: [],
    });
  });

  it('keeps a missing volume null rather than coercing it to zero', () => {
    const thin = { ticker: 'ZZ', close: 12, changePct: 1 };
    expect(extractBoard({ ...body, rows: [thin] })!.rows[0]).toEqual({
      ticker: 'ZZ',
      name: null,
      sector: null,
      close: 12,
      changePct: 1,
      volume: null,
      averageVolume: null,
    });
  });

  it('takes the last-close claim from the route rather than assuming it', () => {
    // Only ever true today. Read rather than hard-coded so that if the board
    // ever gains an intraday source, the screen's wording follows it.
    expect(extractBoard({ ...body, lastClose: false })!.lastClose).toBe(false);
  });

  it('requires the claim to be a boolean rather than coercing a missing one', () => {
    // Coerced, a body without the field would read as "not the last close",
    // and the screen would drop the line while still showing the last close's
    // figures — the one outcome the field exists to prevent.
    expect(extractBoard({ board: 'gainers', rows: [row] })).toBeNull();
    expect(extractBoard({ ...body, lastClose: 'true' })).toBeNull();
    expect(extractBoard({ ...body, lastClose: 1 })).toBeNull();
  });

  it('reads a body it does not recognise as null', () => {
    expect(extractBoard(undefined)).toBeNull();
    expect(extractBoard([row])).toBeNull();
    expect(extractBoard({ ...body, board: 'everything' })).toBeNull();
    expect(extractBoard({ ...body, rows: 'nope' })).toBeNull();
  });

  it('refuses the whole body for a row that is not a board row', () => {
    // The route already drops what the provider could not carry, so a row
    // without a ticker, a close and a change means we are not reading what we
    // think we are reading.
    expect(extractBoard({ ...body, rows: [{ ticker: 'ZZ' }] })).toBeNull();
    expect(extractBoard({ ...body, rows: [{ ...row, close: null }] })).toBeNull();
    expect(extractBoard({ ...body, rows: [null] })).toBeNull();
  });
});

describe('fetchMovers', () => {
  it('asks for the board it was given', async () => {
    const fetchImpl = respond(body);
    await fetchMovers('gainers', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/movers?board=gainers');
  });

  it('returns the board', async () => {
    const result = await fetchMovers('gainers', respond(body) as unknown as typeof fetch);
    expect(result).toEqual({ status: 'ok', data: { board: 'gainers', lastClose: true, rows: [row] } });
  });

  it('reports a failure as unavailable, never as an empty board', async () => {
    // The distinction the screen depends on: an empty board because nothing
    // cleared the filters, versus one because we could not ask.
    const result = await fetchMovers(
      'losers',
      respond({ error: 'upstream_forbidden' }, false) as unknown as typeof fetch,
    );
    expect(result.status).toBe('unavailable');
  });

  it('reports an unreadable body as unavailable', async () => {
    const result = await fetchMovers('active', respond({ rows: [] }) as unknown as typeof fetch);
    expect(result.status).toBe('unavailable');
  });

  it('never throws when the transport does', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await fetchMovers('gainers', boom)).status).toBe('unavailable');
  });
});
