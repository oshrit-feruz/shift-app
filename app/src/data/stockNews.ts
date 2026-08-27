/**
 * LIVE data source — real headlines for one ticker, via this app's own
 * /api/news Vercel function.
 *
 * The function is a server-side proxy for EODHD so the API key never reaches
 * the browser (see app/api/news.ts). It returns at most 10 articles, each
 * with a 1-2 sentence excerpt rather than the full body, for copyright
 * reasons — this module carries that constraint forward by simply not
 * modelling a body field, so there is nothing for a screen to render even by
 * accident.
 *
 * EMPTY IS NOT AN ERROR:
 * A ticker with no recent coverage is a legitimate, successful answer and
 * comes back as ok([]), which the screen renders as an honest empty state.
 * That is a different thing from the provider being down, which is
 * 'unavailable' with a retry. Collapsing the two would either tell a user
 * "no news" during an outage — a quiet lie — or dress a quiet week up as a
 * malfunction. Both are wrong, so the two paths stay distinct all the way to
 * the UI.
 */

import { ok, unavailable, type Loadable, type StockNewsArticle } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const STOCK_NEWS_URL = '/api/news';

/**
 * The function's own upstream budget is 10s; this is the client-side ceiling
 * on top of that, leaving room for the round trip without hanging a screen
 * indefinitely if the platform itself stalls.
 */
const TIMEOUT_MS = 20_000;

/** Trimmed non-empty string, or null. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * A provider timestamp is kept only when its date prefix is a real calendar
 * date. The card renders this value as publication metadata, and the
 * formatter deliberately passes anything it cannot parse through unchanged
 * (so an impossible date is never rolled forward into a plausible one) —
 * which means an unvalidated garbage string here would land on screen
 * verbatim, dressed up as a date. A dropped timestamp renders as no date at
 * all, which is honest; garbage presented as metadata is not. The same
 * round-trip guard as snapshotAgeDays: Date.UTC silently normalises
 * impossible dates, so shape alone is not enough.
 */
function validTimestamp(raw: string): string {
  // Split date from time rather than expressing the whole grammar as one
  // pattern. The single-regex version was both incomplete — it let "+24:00"
  // and "+03:60" through, since only the local clock fields were checked —
  // and complex enough that Sonar flagged it. Two small patterns plus
  // numeric range checks are easier to be sure about than one large one.
  const text = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(text);
  if (!m) return '';
  const [, y, mo, d, rest] = m;

  const back = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Round-trip guard: Date.UTC silently normalises impossible dates.
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(mo) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    return '';
  }

  // Date only is a legitimate provider format.
  if (rest === '') return raw;

  const t = /^[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(rest);
  if (!t) return '';
  const [, hh, mm, ss, zone] = t;
  // 60 seconds is allowed: a real leap second, which providers do emit.
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss ?? 0) > 60) return '';

  if (zone && zone !== 'Z') {
    const off = /^[+-](\d{2}):?(\d{2})$/.exec(zone);
    if (!off) return '';
    // An offset beyond ±23:59 is not a real zone; +24:00 and +03:60 used to
    // pass because only the local clock was range-checked.
    if (Number(off[1]) > 23 || Number(off[2]) > 59) return '';
  }
  return raw;
}

/**
 * Map one raw article. Returns null for a row missing anything the card
 * needs to be useful and honest — a headline with no link is not something
 * this UI can offer, since "read the full article" is the only place the
 * full text is ever allowed to live.
 */
export function mapNewsArticle(raw: unknown): StockNewsArticle | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const headline = str(row.headline);
  const url = str(row.url);
  if (!headline || !url) return null;

  return {
    headline,
    url,
    source: str(row.source) ?? '',
    publishedAt: validTimestamp(str(row.publishedAt) ?? ''),
    summary: str(row.summary) ?? '',
    symbols: Array.isArray(row.symbols)
      ? row.symbols.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [],
  };
}

const UNAVAILABLE = {
  en: 'News is unavailable right now.',
  he: 'החדשות אינן זמינות כרגע.',
};

/**
 * Fetch recent headlines for one ticker. Never throws.
 *
 * `fetchImpl` is injectable so every branch can be tested without a network.
 */
export async function fetchStockNews(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<StockNewsArticle[]>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return unavailable(UNAVAILABLE);
  return readNews(`${STOCK_NEWS_URL}?ticker=${encodeURIComponent(clean)}`, fetchImpl);
}

/**
 * The general market feed — no ticker, so the provider returns whatever is
 * moving across the market rather than one company's coverage.
 *
 * Costs half what a per-ticker request does upstream, which is why the
 * browsable news screen reads this rather than fanning out over a list of
 * large caps. Articles carry their own tagged `symbols`, so a story still
 * shows which stock it is about without the app having decided in advance.
 */
export async function fetchMarketNews(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<StockNewsArticle[]>> {
  return readNews(STOCK_NEWS_URL, fetchImpl);
}

/** Shared transport and honesty handling for both feeds. Never throws. */
async function readNews(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Loadable<StockNewsArticle[]>> {

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // The function returns an {error, message} body on every failure path.
    // None of them are recoverable here, and none may be dressed up as "no
    // news for this ticker".
    if (!res.ok) return unavailable(UNAVAILABLE);

    const body: unknown = await res.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return unavailable(UNAVAILABLE);
    }
    const articles = (body as Record<string, unknown>).articles;
    // A body we do not recognise is unavailable, never an invented empty
    // list — an empty list is a claim ("there is no news"), and we can only
    // make it from a response we actually understood.
    if (!Array.isArray(articles)) return unavailable(UNAVAILABLE);

    return ok(articles.map(mapNewsArticle).filter((a): a is StockNewsArticle => a !== null));
  } catch {
    return unavailable(UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}
