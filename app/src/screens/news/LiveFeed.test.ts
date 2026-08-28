import { describe, it, expect } from 'vitest';
import { fetchWatchlistNews } from './LiveFeed';

const art = (url: string, at: string) => ({
  headline: `H ${url}`,
  source: 'Reuters',
  publishedAt: at,
  summary: 's',
  url,
  symbols: [],
});
const res = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchWatchlistNews', () => {
  it('merges every ticker into one reverse-chronological feed', async () => {
    const byTicker: Record<string, unknown> = {
      NVDA: { articles: [art('https://e/a', '2026-08-26T10:00:00Z')] },
      AAPL: { articles: [art('https://e/b', '2026-08-27T10:00:00Z')] },
    };
    const r = await fetchWatchlistNews(['NVDA', 'AAPL'], async (url) => {
      const tk = new URL(String(url), 'https://x.test').searchParams.get('ticker')!;
      return res(byTicker[tk]);
    });
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.map((a) => a.url)).toEqual(['https://e/b', 'https://e/a']);
  });

  it('shows a story once even when several tickers return it', async () => {
    // One story often carries multiple tickers, so it comes back from more
    // than one request.
    const r = await fetchWatchlistNews(['NVDA', 'AMD'], async () =>
      res({ articles: [art('https://e/same', '2026-08-27T10:00:00Z')] }),
    );
    expect(r.status === 'ok' && r.data).toHaveLength(1);
  });

  it('keeps what succeeded when only some tickers fail', async () => {
    // Blanking the whole feed over one bad ticker would hide real news the
    // user could have read.
    const r = await fetchWatchlistNews(['NVDA', 'BAD'], async (url) => {
      const tk = new URL(String(url), 'https://x.test').searchParams.get('ticker');
      return tk === 'BAD'
        ? res({ error: 'x' }, 502)
        : res({ articles: [art('https://e/a', '2026-08-27T10:00:00Z')] });
    });
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toHaveLength(1);
  });

  it('is unavailable only when every ticker failed', async () => {
    // That is a real outage — and it must not read as "no news today".
    const r = await fetchWatchlistNews(['NVDA', 'AAPL'], async () => res({ error: 'x' }, 502));
    expect(r.status).toBe('unavailable');
  });

  it('treats all-empty-but-successful as a legitimate empty feed', async () => {
    const r = await fetchWatchlistNews(['NVDA'], async () => res({ articles: [] }));
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toEqual([]);
  });

  it('returns an empty feed for an empty watchlist without any request', async () => {
    let called = 0;
    const r = await fetchWatchlistNews([], async () => {
      called += 1;
      return res({ articles: [] });
    });
    expect(r.status).toBe('ok');
    expect(called).toBe(0);
  });

  it('sorts an article with no date last rather than dropping it', async () => {
    // The headline is still real; only its timestamp is missing.
    const r = await fetchWatchlistNews(['NVDA'], async () =>
      res({ articles: [art('https://e/nodate', ''), art('https://e/dated', '2026-08-27T10:00:00Z')] }),
    );
    expect(r.status === 'ok' && r.data.map((a) => a.url)).toEqual(['https://e/dated', 'https://e/nodate']);
  });
});

describe('feed ordering across timezones', () => {
  // Two providers, two offsets, one feed. Before this, the +03:00 article
  // sorted first because its text does, and the feed claimed to be
  // newest-first while showing the older story on top.
  it('orders merged articles by instant, not by timestamp text', async () => {
    const article = (url: string, publishedAt: string) => ({
      id: url,
      headline: url,
      url,
      source: 'X',
      publishedAt,
      summary: '',
      symbols: [],
    });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('AAA')
        ? { articles: [article('a', '2026-08-27T22:00:00+03:00')] }
        : { articles: [article('b', '2026-08-27T20:00:00Z')] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchWatchlistNews(['AAA', 'BBB'], fetchImpl);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.map((a) => a.url)).toEqual(['b', 'a']);
  });
});
