import { describe, it, expect } from 'vitest';
import {
  fetchMarketNews,
  fetchStockNews,
  mapNewsArticle,
  publishedAtMs,
  STOCK_NEWS_URL,
  UNDATED,
} from './stockNews';

const ARTICLE = {
  headline: 'Nvidia beats on datacenter revenue',
  source: 'Reuters',
  publishedAt: '2026-08-26T13:04:00Z',
  summary: 'Revenue rose sharply. Guidance came in ahead of consensus.',
  url: 'https://example.com/a',
};

const res = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('mapNewsArticle', () => {
  it('maps a full article', () => {
    expect(mapNewsArticle(ARTICLE)).toEqual({ ...ARTICLE, symbols: [] });
  });

  it("carries the feed's tagged symbols, dropping unusable entries", () => {
    // Only the general market feed populates these; a per-ticker response
    // legitimately has none, since the caller already knows the stock.
    expect(mapNewsArticle({ ...ARTICLE, symbols: ['NVDA', 'AMD'] })?.symbols).toEqual(['NVDA', 'AMD']);
    expect(mapNewsArticle({ ...ARTICLE, symbols: ['NVDA', '', '  ', null, 7] })?.symbols).toEqual(['NVDA']);
    for (const v of [undefined, null, 'NVDA', {}]) {
      expect(mapNewsArticle({ ...ARTICLE, symbols: v })?.symbols, String(v)).toEqual([]);
    }
  });

  it('drops a row with no headline or no url', () => {
    // Without a link there is nowhere to send someone for the full text, and
    // the full text is the one thing this UI is never allowed to hold.
    expect(mapNewsArticle({ ...ARTICLE, headline: '' })).toBeNull();
    expect(mapNewsArticle({ ...ARTICLE, url: '' })).toBeNull();
    expect(mapNewsArticle({ ...ARTICLE, url: undefined })).toBeNull();
  });

  it('keeps a missing source, date or summary as empty rather than inventing one', () => {
    const m = mapNewsArticle({ headline: 'H', url: 'https://e.com/x' });
    expect(m).toEqual({
      headline: 'H',
      url: 'https://e.com/x',
      source: '',
      publishedAt: '',
      summary: '',
      symbols: [],
    });
  });

  it('drops a malformed publishedAt rather than passing it through as metadata', () => {
    // The card renders publishedAt as a date, and the date formatter passes
    // anything unparseable through unchanged — so garbage kept here would
    // reach the screen verbatim. No date is honest; fake metadata is not.
    for (const bad of [
      'garbage',
      'not-a-date-at-all',
      '2026-13-45T09:00:00Z',
      '2026-02-31T00:00:00Z',
      '26/08/2026',
    ]) {
      expect(mapNewsArticle({ ...ARTICLE, publishedAt: bad })?.publishedAt, bad).toBe('');
    }
    // The whole string must validate, not just its date prefix: publishedAt
    // is the reverse-chronological sort key, and an impossible hour sorts
    // above every real one.
    for (const bad of [
      '2026-08-26T99:00:00Z',
      '2026-08-26T12:99:00Z',
      '2026-08-26junk',
      '2026-08-26T12:00:00Z tail',
    ]) {
      expect(mapNewsArticle({ ...ARTICLE, publishedAt: bad })?.publishedAt, bad).toBe('');
    }
    // Timezone offsets are range-checked too: only the local clock fields
    // were validated before, so these passed.
    for (const bad of [
      '2026-08-26T13:04+24:00',
      '2026-08-26T13:04+03:60',
      '2026-08-26T13:04+9999',
      '2026-08-26T13:04+03',
    ]) {
      expect(mapNewsArticle({ ...ARTICLE, publishedAt: bad })?.publishedAt, bad).toBe('');
    }
    // Real provider formats survive.
    for (const good of [
      '2026-08-26T13:04:00Z',
      '2026-08-26T13:04:00+03:00',
      '2026-08-26 13:04',
      '2026-08-26T13:04:00.512Z',
      '2026-08-26T13:04:00-05:00',
      '2026-08-26T13:04:00+0330',
      '2026-08-26T23:59:60Z',
      '2026-08-26',
    ]) {
      expect(mapNewsArticle({ ...ARTICLE, publishedAt: good })?.publishedAt, good).toBe(good);
    }
    // A real timestamp survives untouched.
    expect(mapNewsArticle(ARTICLE)?.publishedAt).toBe('2026-08-26T13:04:00Z');
    // A bare date with no time part is also fine — providers vary.
    expect(mapNewsArticle({ ...ARTICLE, publishedAt: '2026-08-26' })?.publishedAt).toBe('2026-08-26');
  });

  it('rejects non-objects', () => {
    expect(mapNewsArticle(null)).toBeNull();
    expect(mapNewsArticle([ARTICLE])).toBeNull();
    expect(mapNewsArticle('x')).toBeNull();
  });

  it('models no article body at all, so a full text cannot be rendered', () => {
    const m = mapNewsArticle({ ...ARTICLE, body: 'FULL ARTICLE TEXT', content: 'ALSO FULL' });
    expect(JSON.stringify(m)).not.toContain('FULL ARTICLE TEXT');
    expect(JSON.stringify(m)).not.toContain('ALSO FULL');
  });
});

describe('fetchStockNews', () => {
  it('returns the real list on success', async () => {
    const r = await fetchStockNews('NVDA', async () => res({ ticker: 'NVDA', articles: [ARTICLE] }));
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toHaveLength(1);
  });

  it('treats an empty list as a legitimate ok, NOT an error', async () => {
    // A quiet week for a stock is a real answer. Calling it a failure would
    // train people to distrust a working screen.
    const r = await fetchStockNews('NVDA', async () => res({ ticker: 'NVDA', articles: [] }));
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toEqual([]);
  });

  it('is unavailable — never an empty list — when the function errors', async () => {
    // The inverse of the case above, and the one that matters: an outage
    // must not read as "no news for this stock".
    for (const status of [400, 429, 500, 502]) {
      const r = await fetchStockNews('NVDA', async () =>
        res({ error: 'upstream_unavailable', message: 'nope' }, status),
      );
      expect(r.status, `HTTP ${status}`).toBe('unavailable');
    }
  });

  it('is unavailable when the body is a shape we do not recognise', async () => {
    for (const body of [{}, { articles: null }, { articles: 'none' }, [ARTICLE], null, 42]) {
      const r = await fetchStockNews('NVDA', async () => res(body));
      expect(r.status, JSON.stringify(body)).toBe('unavailable');
    }
  });

  it('is unavailable on a network failure and on unparseable JSON', async () => {
    const boom = await fetchStockNews('NVDA', async () => {
      throw new Error('offline');
    });
    expect(boom.status).toBe('unavailable');

    const garbage = await fetchStockNews('NVDA', async () => new Response('<html>', { status: 200 }));
    expect(garbage.status).toBe('unavailable');
  });

  it('drops unusable rows but keeps the good ones', async () => {
    const r = await fetchStockNews('NVDA', async () =>
      res({ articles: [ARTICLE, { headline: 'no link' }, null, { ...ARTICLE, url: 'https://e.com/b' }] }),
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.map((a) => a.url)).toEqual([
      'https://example.com/a',
      'https://e.com/b',
    ]);
  });

  it('calls the same-origin function with an encoded, uppercased ticker', async () => {
    let seen = '';
    await fetchStockNews('brk.b', async (url) => {
      seen = String(url);
      return res({ articles: [] });
    });
    expect(seen).toBe(`${STOCK_NEWS_URL}?ticker=BRK.B`);
    // Must never reach the provider — the API key lives server-side only.
    expect(seen).not.toContain('eodhd');
  });

  it('reads the general market feed with no ticker param at all', async () => {
    let seen = '';
    const r = await fetchMarketNews(async (url) => {
      seen = String(url);
      return res({ ticker: null, articles: [{ ...ARTICLE, symbols: ['NVDA'] }] });
    });
    // No `ticker=` — that is what makes it the cheaper 5-credit feed call
    // upstream rather than a 10-credit per-ticker one.
    expect(seen).toBe(STOCK_NEWS_URL);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data[0].symbols).toEqual(['NVDA']);
  });

  it('applies the same honesty contract to the feed as to a ticker', async () => {
    const err = await fetchMarketNews(async () => res({ error: 'upstream_unavailable' }, 502));
    expect(err.status).toBe('unavailable');
    const empty = await fetchMarketNews(async () => res({ ticker: null, articles: [] }));
    expect(empty.status).toBe('ok');
    expect(empty.status === 'ok' && empty.data).toEqual([]);
  });

  it('rejects an empty ticker without calling the network', async () => {
    let called = 0;
    const r = await fetchStockNews('  ', async () => {
      called += 1;
      return res({ articles: [] });
    });
    expect(r.status).toBe('unavailable');
    expect(called).toBe(0);
  });
});

describe('failure reasons', () => {
  // The screen used to say "News is unavailable right now" for a plan the
  // provider refuses — advice to wait for something that will not change.
  it("carries the function's specific reason through to the screen", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'upstream_forbidden', upstreamStatus: 403 }), {
        status: 502,
      })) as unknown as typeof fetch;
    const result = await fetchStockNews('NVDA', fetchImpl);
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason?.he).toContain('מנוי');
  });

  it('keeps the generic reason when the failure is unrecognised', async () => {
    const fetchImpl = (async () =>
      new Response('gateway exploded', { status: 502 })) as unknown as typeof fetch;
    const result = await fetchMarketNews(fetchImpl);
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason?.he).toContain('אינן זמינות');
  });
});

describe('publishedAtMs', () => {
  // The bug this exists for: +03:00 22:00 IS 19:00Z, but as text it sorts
  // above 20:00Z. A merged feed then reads newest-first and is not.
  it('orders by the instant, not by the text', () => {
    const later = publishedAtMs('2026-08-27T20:00:00+00:00');
    const earlier = publishedAtMs('2026-08-27T22:00:00+03:00');
    expect(earlier).toBeLessThan(later);
    expect('2026-08-27T22:00:00+03:00' > '2026-08-27T20:00:00+00:00').toBe(true);
  });

  it('treats the same instant written three ways as equal', () => {
    const ms = publishedAtMs('2026-08-27T19:00:00Z');
    expect(publishedAtMs('2026-08-27T22:00:00+03:00')).toBe(ms);
    expect(publishedAtMs('2026-08-27T14:00:00-05:00')).toBe(ms);
  });

  // An article we cannot date must never be presented as the freshest thing
  // on the screen.
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unparseable', 'yesterday'],
    ['null', null],
  ])('sorts a %s timestamp oldest', (_label, value) => {
    expect(publishedAtMs(value as string | null | undefined)).toBe(UNDATED);
  });

  // validTimestamp deliberately accepts a leap second because providers emit
  // them — but Date.parse answers NaN for one, so the article we went out of
  // our way to keep would have sorted to the bottom as undated.
  it('dates a leap second as the instant before the next minute', () => {
    const leap = publishedAtMs('2016-12-31T23:59:60Z');
    expect(leap).not.toBe(UNDATED);
    expect(leap).toBe(publishedAtMs('2016-12-31T23:59:59Z') + 1000);
    expect(leap).toBeLessThan(publishedAtMs('2017-01-01T00:00:01Z'));
  });

  // validTimestamp accepts "2016-12-31 23:59:60Z" as well as the T form, so a
  // normaliser that only knew about T left the space form undated — the
  // validator and the parser have to agree on the same grammar.
  it('dates a space-separated leap second, the other form the validator accepts', () => {
    const leap = publishedAtMs('2016-12-31 23:59:60Z');
    expect(leap).not.toBe(UNDATED);
    expect(leap).toBe(publishedAtMs('2016-12-31 23:59:59Z') + 1000);
  });

  it('handles a leap second carrying an offset', () => {
    expect(publishedAtMs('2016-12-31T23:59:60+02:00')).toBe(
      publishedAtMs('2016-12-31T23:59:59+02:00') + 1000,
    );
  });

  it('stays a usable comparator when both sides are undated', () => {
    expect(publishedAtMs(undefined) - publishedAtMs(undefined)).toBe(0);
  });
});
