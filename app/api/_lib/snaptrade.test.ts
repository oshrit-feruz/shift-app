import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildQuery,
  buildUserQuery,
  connectBody,
  readRedirectUri,
  readRegistration,
  snapTradeUserId,
  canonicalJson,
  computeSignature,
  mapAccount,
  mapBalance,
  mapPosition,
  maskAccountNumber,
  unwrapPositions,
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

  it('orders keys by code unit, NOT by locale', () => {
    // The guard on the signature. localeCompare sorts these as a, B, e, é, Z;
    // code units give B, Z, a, e, é. Only the second is what SnapTrade's
    // server reproduces when it recomputes the HMAC, so "fixing" the sort to
    // be locale-aware would 401 every request. This test fails if anyone does.
    expect(canonicalJson({ B: 1, a: 2, Z: 3, é: 4, e: 5 })).toBe('{"B":1,"Z":3,"a":2,"e":5,"é":4}');
  });

  it('is independent of key insertion order', () => {
    expect(canonicalJson({ query: 1, content: 2, path: 3 })).toBe(
      canonicalJson({ path: 3, query: 1, content: 2 }),
    );
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
    expect(computeSignature({ ...base, path: '/api/v1/accounts/x/positions' })).not.toBe(
      computeSignature(base),
    );
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

describe('buildUserQuery', () => {
  it('carries the person’s credentials, percent-encoded so the signed string matches the sent one', () => {
    const q = buildUserQuery('cid', 1700000000, 'shift-a b', 'se/cret');
    expect(q).toBe('clientId=cid&timestamp=1700000000&userId=shift-a%20b&userSecret=se%2Fcret');
  });

  it('omits the secret for the one path that does not take it', () => {
    // Deleting a SnapTrade user is authorised by the partner key and the id;
    // sending a secret the path does not declare would change the signed
    // string for nothing.
    expect(buildUserQuery('cid', 1, 'shift-x')).toBe('clientId=cid&timestamp=1&userId=shift-x');
  });
});

describe('connectBody', () => {
  it('asks for a READ connection — this app can never place an order', () => {
    expect(connectBody('https://shift.app', true)).toMatchObject({ connectionType: 'read' });
  });

  it('returns the person to the app when there is somewhere to return them to', () => {
    expect(connectBody('https://shift.app', false)).toMatchObject({
      immediateRedirect: true,
      customRedirect: 'https://shift.app',
      darkMode: false,
    });
  });

  it('omits the redirect entirely when there is not', () => {
    // An immediate redirect to an empty string is not a weaker version of
    // returning someone to the app; it is a request to send them nowhere.
    const body = connectBody('', true);
    expect(body).not.toHaveProperty('immediateRedirect');
    expect(body).not.toHaveProperty('customRedirect');
  });
});

describe('snapTradeUserId', () => {
  it('prefixes the app’s own name, so a row in SnapTrade’s dashboard is identifiable', () => {
    expect(snapTradeUserId('abc-123')).toBe('shift-abc-123');
  });
});

describe('readRedirectUri', () => {
  it('reads the portal link', () => {
    expect(readRedirectUri({ redirectURI: 'https://app.snaptrade.com/x' })).toBe(
      'https://app.snaptrade.com/x',
    );
  });

  it('refuses anything that is not an https URL', () => {
    // This is where a person is about to type brokerage credentials.
    for (const redirectURI of ['http://evil.example', 'javascript:alert(1)', '', 42, null]) {
      expect(readRedirectUri({ redirectURI })).toBeNull();
    }
    expect(readRedirectUri(null)).toBeNull();
    // The encrypted-response variant the schema also allows: not a URL, and
    // reported as unreadable rather than sending someone to "undefined".
    expect(readRedirectUri({ encryptedMessageData: {} })).toBeNull();
  });
});

describe('readRegistration', () => {
  it('reads the id and the secret together', () => {
    expect(readRegistration({ userId: 'shift-1', userSecret: 's' })).toEqual({
      userId: 'shift-1',
      userSecret: 's',
    });
  });

  it('is null when either half is missing — the secret is never sent twice', () => {
    expect(readRegistration({ userId: 'shift-1' })).toBeNull();
    expect(readRegistration({ userSecret: 's' })).toBeNull();
    expect(readRegistration(null)).toBeNull();
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
      connectionId: null,
      name: 'Individual',
      numberMasked: '••4321',
      institution: 'Interactive Brokers',
      currency: 'USD',
      totalValue: 12345.67,
    });
  });

  it('carries the owning connection id, so a disabled connection can be excluded', () => {
    expect(mapAccount({ id: 'a', brokerage_authorization: 'conn-1' })?.connectionId).toBe('conn-1');
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

describe('unwrapPositions', () => {
  it('reads the results array and the freshness stamp', () => {
    expect(
      unwrapPositions({ results: [{ a: 1 }], data_freshness: { as_of: '2026-08-28T14:30:00Z' } }),
    ).toEqual({ rows: [{ a: 1 }], asOf: '2026-08-28T14:30:00Z' });
  });

  it('accepts a response with no freshness stamp', () => {
    expect(unwrapPositions({ results: [] })).toEqual({ rows: [], asOf: null });
  });

  it('rejects a bare array — the endpoint answers an envelope, and reading it as a list would silently yield zero positions', () => {
    expect(unwrapPositions([{ a: 1 }])).toBeNull();
  });

  it('rejects a body with no results array rather than reporting an empty account', () => {
    expect(unwrapPositions({})).toBeNull();
    expect(unwrapPositions({ results: 'nope' })).toBeNull();
    expect(unwrapPositions(null)).toBeNull();
  });
});

describe('mapPosition', () => {
  const AAPL = {
    instrument: {
      kind: 'stock',
      symbol: 'AAPL',
      raw_symbol: 'AAPL',
      description: 'Apple Inc.',
      currency: 'USD',
    },
    units: '10.5',
    price: '200',
    cost_basis: '150',
    currency: 'USD',
  };

  it('maps an AccountPosition, parsing the decimal strings SnapTrade sends', () => {
    expect(mapPosition(AAPL)).toEqual({
      ticker: 'AAPL',
      description: 'Apple Inc.',
      units: 10.5,
      price: 200,
      marketValue: 2100,
      avgCost: 150,
      openPnl: 525,
      currency: 'USD',
    });
  });

  it('falls back to the instrument raw symbol', () => {
    expect(mapPosition({ instrument: { kind: 'stock', raw_symbol: 'NVDA' } })?.ticker).toBe('NVDA');
  });

  it('maps an option position by its OCC symbol', () => {
    expect(
      mapPosition({ instrument: { kind: 'option', symbol: 'AAPL  261218C00240000' }, units: '1' })?.ticker,
    ).toBe('AAPL  261218C00240000');
  });

  it('leaves market value null when the price is unknown, rather than a confident zero', () => {
    const p = mapPosition({ instrument: { kind: 'stock', symbol: 'NVDA' }, units: '3' });
    expect(p?.units).toBe(3);
    expect(p?.price).toBeNull();
    expect(p?.marketValue).toBeNull();
  });

  it('leaves the derived P&L null when the cost basis is missing — it is arithmetic, never an estimate', () => {
    expect(mapPosition({ ...AAPL, cost_basis: null })?.openPnl).toBeNull();
  });

  it('derives a loss as a negative number', () => {
    expect(mapPosition({ ...AAPL, price: '100' })?.openPnl).toBe(-525);
  });

  it('keeps a short position negative', () => {
    expect(
      mapPosition({ instrument: { kind: 'stock', symbol: 'TSLA' }, units: '-4', price: '100' })?.marketValue,
    ).toBe(-400);
  });

  it('falls back to the instrument currency', () => {
    expect(mapPosition({ instrument: { kind: 'etf', symbol: 'VOO', currency: 'USD' } })?.currency).toBe(
      'USD',
    );
  });

  it('drops a row with no symbol at all', () => {
    expect(mapPosition({ instrument: { kind: 'other' }, units: '5' })).toBeNull();
    expect(mapPosition({ units: 5, price: 10 })).toBeNull();
  });
});
