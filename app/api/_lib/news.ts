/**
 * Pure helpers for the /api/news proxy — kept separate from the handler so
 * they can be unit-tested directly, without spinning up a request/response
 * pair or mocking global fetch.
 */

export interface UpstreamArticle {
  title?: unknown;
  headline?: unknown;
  link?: unknown;
  url?: unknown;
  date?: unknown;
  published_at?: unknown;
  pubDate?: unknown;
  content?: unknown;
  source?: unknown;
  publisher?: unknown;
  provider?: unknown;
}

export interface NewsArticle {
  headline: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
}

const SUMMARY_MAX_CHARS = 280;

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * A short excerpt of the article body — never the full text, which EODHD's
 * `content` field can carry in full; returning that verbatim is exactly the
 * copyright exposure this endpoint exists to avoid. Cuts at the end of the
 * first one or two sentences, and separately hard-caps length so a single
 * run-on "sentence" can't slip through uncapped.
 */
export function summarize(content: string | null): string {
  if (!content) return '';
  const text = content
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = sentences
    .slice(0, 2)
    .map((s) => s.trim())
    .join(' ');
  if (out.length > SUMMARY_MAX_CHARS) {
    out = out.slice(0, SUMMARY_MAX_CHARS).replace(/\s+\S*$/, '').trim() + '…';
  }
  return out;
}

/**
 * EODHD's news payload has no consistently-documented "publication" field
 * across tiers, so this falls back to the article URL's hostname — a real
 * fact about the article, not a guess — rather than leaving source blank.
 */
export function deriveSource(a: UpstreamArticle, url: string | null): string {
  const named = firstString(a.source, a.publisher, a.provider);
  if (named) return named;
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* not a valid URL — fall through to the generic label below */
    }
  }
  return 'Unknown';
}

/**
 * Maps one raw EODHD news item to the shape /api/news returns. A row missing
 * a headline or link is dropped rather than filled in with a placeholder —
 * a malformed upstream entry is skipped, never invented.
 */
export function mapArticle(raw: unknown): NewsArticle | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as UpstreamArticle;
  const headline = firstString(a.title, a.headline);
  const url = firstString(a.link, a.url);
  if (!headline || !url) return null;
  const publishedAt = firstString(a.date, a.published_at, a.pubDate) ?? '';
  const summary = summarize(firstString(a.content));
  return { headline, source: deriveSource(a, url), publishedAt, summary, url };
}

/** EODHD requires an exchange suffix; default to US equities unless the caller already specified one (e.g. "VOD.LSE"). */
export function resolveSymbol(ticker: string): string {
  return ticker.includes('.') ? ticker : `${ticker}.US`;
}

/** Conservative allow-list: letters, digits, dot, hyphen — covers real tickers and exchange suffixes, nothing that could smuggle extra query params upstream. */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Za-z0-9.-]{1,15}$/.test(ticker);
}
