import { describe, expect, it } from 'vitest';
import { backoffMs, parseFrame } from './feed.js';

/**
 * What comes off the wire is the provider's; what the worker acts on is
 * ours. These tables pin the boundary: a trade is a symbol with a positive
 * price, a status is a status_code, and everything else is ignored rather
 * than turned into a price nobody printed.
 */
describe('parseFrame', () => {
  it('reads a trade frame as the docs describe it', () => {
    const f = parseFrame(
      '{"s":"AAPL","p":309.19,"c":[],"v":2,"dp":false,"ms":"extended-hours","t":1787671313868}',
    );
    expect(f).toEqual({
      kind: 'trade',
      trade: { symbol: 'AAPL', price: 309.19, at: 1787671313868, status: 'extended-hours' },
    });
  });

  it('reads the authorisation and error frames', () => {
    expect(parseFrame('{"status_code":200,"message":"Authorized"}')).toEqual({
      kind: 'status',
      code: 200,
      message: 'Authorized',
    });
    expect(parseFrame('{"status_code":422,"message":"Symbols limit reached"}')).toMatchObject({
      kind: 'status',
      code: 422,
    });
  });

  it('ignores what it cannot read rather than inventing a price', () => {
    expect(parseFrame('not json')).toEqual({ kind: 'ignore' });
    expect(parseFrame('[]')).toEqual({ kind: 'ignore' });
    expect(parseFrame('{"s":"AAPL","p":0}')).toEqual({ kind: 'ignore' });
    expect(parseFrame('{"s":"AAPL","p":"309"}')).toEqual({ kind: 'ignore' });
    expect(parseFrame('{"p":309}')).toEqual({ kind: 'ignore' });
  });

  it('normalises the symbol and tolerates a missing timestamp', () => {
    const f = parseFrame('{"s":" nvda ","p":1}');
    expect(f.kind).toBe('trade');
    if (f.kind === 'trade') {
      expect(f.trade.symbol).toBe('NVDA');
      expect(f.trade.status).toBeNull();
      expect(typeof f.trade.at).toBe('number');
    }
  });
});

describe('backoffMs', () => {
  it('doubles from a second and caps at a minute', () => {
    expect([0, 1, 2, 3, 6, 7, 40].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 60_000, 60_000, 60_000]);
  });
});
