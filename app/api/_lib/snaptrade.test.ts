import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildQuery,
  canonicalJson,
  computeSignature,
  mapAccount,
  mapBalance,
  mapPosition,
  maskAccountNumber,
} from './snaptrade.js';

describe('canonicalJson', () => {
  it('sorts object keys alphabetically at every level and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order — sorting an array would change the value, not its spelling', () => {
    expect(canonicalJson({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
  });

  it('serialises null', () => {
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('computeSignature', () => {
  it('is the base64 HMAC-SHA256 of the canonical {content,path,query}', () => {
    const consumerKey = 'test-consumer-key';
    const path = '/api/v1/accounts';
    const query = 'clientId=demo&timestamp=1700000000';
    const expected = createHmac('sha256', consumerKey)
      .update(`{"content":null,"path":"${path}","query":"${query}"}`, 'utf8')
      .digest('base64');
    expect(computeSignature({ path, query, consumerKey })).toBe(expected);
  });

  it('signs a null content for a GET, so the body field is never omitted', () => {
    const a = computeSignature({ path: '/api/v1/accounts', query: 'q=1', consumerKey: 'k' });
    const b = computeSignature({ path: '/api/v1/accounts', query: 'q=1', consumerKey: 'k', content: null });
    expect(a).toBe(b);
  });

  it('changes when the path, the query or the key changes', () => {
    const base = { path: '/api/v1/accounts', query: 'q=1', consumerKey: 'k' };
    expect(computeSignature({ ...base, path: '/api/v1/accounts/x/positions' })).not.toBe(computeSignature(base));
    expect(computeSignature({ ...base, query: 'q=2' })).not.toBe(computeSignature(base));
    expect(computeSignature({ ...base, consumerKey: 'other' })).not.toBe(computeSignature(base));
  });
});

describe('buildQuery', () => {
  it('carries only clientId and timestamp — never userId or userSecret', () => {
    const q = buildQuery('my-client', 1700000000);
    expect(q).toBe('clientId=my-client&timestamp=1700000000');
    expect(q).not.toMatch(/userId|userSecret/);
  });

  it('percent-encodes a clientId that needs it, so the signed string matches the sent one', () => {
    expect(buildQuery('a b&c', 1)).toBe('clientId=a%20b%26c&timestamp=1');
  });
});

describe('maskAccountNumber', () => {
  it('keeps only the last four characters', () => {
    expect(maskAccountNumber('123456789')).toBe('••6789');
  });

  it('masks a short number without slicing it into nothing', () => {
    expect(maskAccountNumber('12')).toBe('••12');
  });

  it('returns null for a missing or non-string number rather than a fake mask', () => {
    expect(maskAccountNumber(undefined)).toBeNull();
    expect(maskAccountNumber('')).toBeNull();
    expect(maskAccountNumber(42)).toBeNull();
  });
});

describe('mapAccount', () => {
  it('maps a realistic account row and masks the number', () => {
    expect(
      mapAccount({
        id: 'acc-1',
        name: 'Individual',
        number: '987654321',
        institution_name: 'Interactive Brokers',
        balance: { total: { amount: 12345.67, currency: 'USD' } },
      }),
    ).toEqual({
      id: 'acc-1',
      name: 'Individual',
      numberMasked: '••4321',
      institution: 'Interactive Brokers',
      currency: 'USD',
      totalValue: 12345.67,
    });
  });

  it('drops a row with no id — an account we cannot address is not shown', () => {
    expect(mapAccount({ name: 'No id' })).toBeNull();
    expect(mapAccount(null)).toBeNull();
    expect(mapAccount('nope')).toBeNull();
  });

  it('leaves an absent total as null rather than zero', () => {
    expect(mapAccount({ id: 'a' })?.totalValue).toBeNull();
  });
});

describe('mapBalance', () => {
  it('maps currency and cash', () => {
    expect(mapBalance({ currency: { code: 'USD' }, cash: 250.5, buying_power: 500 })).toEqual({
      currency: 'USD',
      cash: 250.5,
      buyingPower: 500,
    });
  });

  it('tolerates a numeric string', () => {
    expect(mapBalance({ currency: { code: 'ILS' }, cash: '19.25' })?.cash).toBe(19.25);
  });

  it('drops a row that carries nothing, so it cannot render as a real zero balance', () => {
    expect(mapBalance({})).toBeNull();
  });
});

describe('mapPosition', () => {
  it('maps a nested SnapTrade position and computes market value', () => {
    expect(
      mapPosition({
        symbol: { symbol: { symbol: 'AAPL', description: 'Apple Inc.', currency: { code: 'USD' } } },
        units: 10,
        price: 200,
        average_purchase_price: 150,
        open_pnl: 500,
      }),
    ).toEqual({
      ticker: 'AAPL',
      description: 'Apple Inc.',
      units: 10,
      price: 200,
      marketValue: 2000,
      avgCost: 150,
      openPnl: 500,
      currency: 'USD',
    });
  });

  it('leaves market value null when the price is unknown, rather than producing a confident zero', () => {
    const p = mapPosition({ symbol: { symbol: { symbol: 'NVDA' } }, units: 3 });
    expect(p?.units).toBe(3);
    expect(p?.price).toBeNull();
    expect(p?.marketValue).toBeNull();
  });

  it('keeps a short position negative', () => {
    expect(mapPosition({ symbol: { symbol: { symbol: 'TSLA' } }, units: -4, price: 100 })?.marketValue).toBe(-400);
  });

  it('drops a row with no ticker', () => {
    expect(mapPosition({ units: 5, price: 10 })).toBeNull();
  });
});
