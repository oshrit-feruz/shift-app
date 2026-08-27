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
  symbols?: unknown;
}

export interface NewsArticle {
  headline: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  /**
   * Tickers EODHD tagged this article with, bare and uppercased (exchange
   * suffixes stripped: "AAPL.US" -> "AAPL").
   *
   * Only meaningful for the general market feed, where an article is not
   * scoped to a ticker the caller already knows — the UI shows the first one
   * as the story's subject. Empty is normal and not an error: plenty of real
   * market news is about a sector, an index or a rate decision rather than
   * one company, and inventing a ticker for those would be a fabrication.
   */
  symbols: string[];
}

const SUMMARY_MAX_CHARS = 280;

/**
 * How much of an upstream article body is examined at all.
 *
 * Comfortably more than two sentences ever need, and small enough that the
 * quadratic-worst-case cleanup below cannot become a denial-of-service
 * vector on a public endpoint. See summarize().
 */
const WORKING_MAX_CHARS = 4_000;

/** First candidate that is a non-empty string, trimmed — EODHD's field names vary by row, so callers pass several in priority order. */
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

  // ONE LINEAR PASS, no regex.
  //
  // This used to be four chained regex replaces. Each was quadratic on a run
  // of one repeated character — measured on the old code, 80KB of "<" took
  // ~7s in the tag strip and ~9.7s in the sentence split, against this
  // function's own 10s budget. The content is an upstream article body, so
  // its size and shape are not ours to trust, and one oversized row could
  // have consumed a whole request.
  //
  // A single scan does the same work in time proportional to the input, with
  // no backtracking behaviour to reason about. The WORKING_MAX_CHARS bound
  // stays as a second line of defence: this function can only ever return
  // two sentences capped at SUMMARY_MAX_CHARS, so nothing past that prefix
  // could have reached the output anyway.
  const src = content.slice(0, WORKING_MAX_CHARS);

  let text = '';
  let inTag = false;
  let pendingSpace = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    // Strip <...> markup.
    if (inTag) {
      if (ch === '>') inTag = false;
      continue;
    }
    if (ch === '<') {
      inTag = true;
      continue;
    }
    // Collapse any run of whitespace to a single space, emitted lazily so a
    // trailing run never reaches the output.
    if (isSpace(ch)) {
      pendingSpace = text !== '';
      continue;
    }
    // Drop the space before punctuation rather than emitting it.
    if (pendingSpace && !isTightPunctuation(ch)) text += ' ';
    pendingSpace = false;
    text += ch;
  }
  if (!text) return '';

  // First one or two sentences: a run of non-terminators followed by a run of
  // terminators, matching what the old expression accepted.
  let out = takeSentences(text, 2);
  if (out.length > SUMMARY_MAX_CHARS) {
    const cut = out.slice(0, SUMMARY_MAX_CHARS - 1);
    // Back up to the last space so the excerpt does not end mid-word.
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }
  return out;
}

/** Whitespace, without a regex so the scan above stays allocation-free. */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/** Punctuation that should not be preceded by a space. */
function isTightPunctuation(ch: string): boolean {
  return ch === '.' || ch === ',' || ch === '!' || ch === '?' || ch === ';' || ch === ':';
}

/** A sentence terminator. */
function isTerminator(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?';
}

/**
 * The first `count` sentences of already-cleaned text, joined by a space.
 *
 * A sentence is a run of non-terminator characters followed by a run of
 * terminators — the same shape the previous regex matched, which means text
 * with no terminator at all yields the whole string rather than nothing.
 */
function takeSentences(text: string, count: number): string {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length && parts.length < count) {
    if (!isTerminator(text[i])) {
      i += 1;
      continue;
    }
    // Consume the whole run of terminators ("?!", "...").
    while (i < text.length && isTerminator(text[i])) i += 1;
    parts.push(text.slice(start, i).trim());
    start = i;
  }
  // No terminator anywhere: the old expression fell back to the full text.
  if (parts.length === 0) return text.trim();
  return parts.join(' ');
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

/** True only for a well-formed http(s) URL — never a relative path, javascript:, or other scheme. */
function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Maps one raw EODHD news item to the shape /api/news returns. A row missing
 * a headline, missing a link, or whose link isn't a real http(s) URL is
 * dropped rather than filled in with a placeholder or forwarded as-is — a
 * malformed or unsafe upstream entry is skipped, never invented or passed
 * through unchecked to the frontend (which renders it as a clickable link).
 */
export function mapArticle(raw: unknown): NewsArticle | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as UpstreamArticle;
  const headline = firstString(a.title, a.headline);
  const url = firstString(a.link, a.url);
  if (!headline || !url || !isHttpUrl(url)) return null;
  const publishedAt = firstString(a.date, a.published_at, a.pubDate) ?? '';
  const summary = summarize(firstString(a.content));
  return {
    headline,
    source: deriveSource(a, url),
    publishedAt,
    summary,
    url,
    symbols: mapSymbols(a.symbols),
  };
}

/**
 * EODHD tags each article with an array like ["AAPL.US", "MSFT.US"]. The app
 * addresses stocks by bare ticker, so the exchange suffix is stripped here
 * rather than at three separate call sites. Anything that is not a usable
 * string is dropped rather than coerced — a malformed entry must not become
 * a ticker the UI then tries to navigate to.
 */
export function mapSymbols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const bare = v.trim().split('.')[0].toUpperCase();
    // Same allow-list as an inbound ticker: whatever ends up here can be
    // rendered as a chip and used to open a stock page.
    if (bare && /^[A-Z0-9-]{1,15}$/.test(bare) && !out.includes(bare)) out.push(bare);
  }
  return out;
}

/** EODHD requires an exchange suffix; default to US equities unless the caller already specified one (e.g. "VOD.LSE"). */
export function resolveSymbol(ticker: string): string {
  return ticker.includes('.') ? ticker : `${ticker}.US`;
}

/** Conservative allow-list: letters, digits, dot, hyphen — covers real tickers and exchange suffixes, nothing that could smuggle extra query params upstream. */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Za-z0-9.-]{1,15}$/.test(ticker);
}
