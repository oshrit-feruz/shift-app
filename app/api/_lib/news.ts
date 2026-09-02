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
  sentiment?: unknown;
}

/**
 * How the provider scored the article's tone. Not our judgement: EODHD ships a
 * `sentiment` object with the row, and this is a reading of its `polarity`.
 */
export type Sentiment = 'positive' | 'negative' | 'neutral';

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
  /**
   * The provider's own tone score, bucketed — or null when it did not send
   * one, which is normal: EODHD includes `sentiment` only on some plans and
   * not on every row. Null means "we were not told", and the UI shows no tag
   * rather than guessing at "neutral". Silence and a real neutral score are
   * different claims, and only one of them is ours to make.
   */
  sentiment: Sentiment | null;
}

const SUMMARY_MAX_CHARS = 280;

/**
 * Where a polarity score stops being neutral.
 *
 * EODHD's polarity runs -1..1 and comes from a VADER-style model, whose own
 * documented cut-off for "not neutral" is ±0.05 — so this threshold is the
 * upstream convention rather than a number we picked. It lives here, named,
 * because it is the one tunable in this mapping: raise it and more stories
 * read as neutral.
 */
const SENTIMENT_THRESHOLD = 0.05;

/**
 * How much of an upstream article body is examined at all.
 *
 * Comfortably more than two sentences ever need, and small enough that the
 * quadratic-worst-case cleanup below cannot become a denial-of-service
 * vector on a public endpoint. See summarize().
 */
const WORKING_MAX_CHARS = 4_000;

/** Return the first value that is a non-empty trimmed string, or null if none exist. Useful when EODHD's field names vary by row. */
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
  let pendingSpace = false;
  // A while loop rather than a for: skipping a whole tag advances the cursor
  // by more than one, and reassigning a for-loop's counter inside its body is
  // the kind of control flow that reads as a mistake even when it is not.
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // Strip markup — but only where "<" actually begins a tag. A bare "<" is
    // ordinary text in financial copy ("guidance is < 5%"), and treating it
    // as markup silently swallows the rest of the sentence.
    if (ch === '<' && looksLikeTag(src, i)) {
      // Past the closing bracket in one step. looksLikeTag guarantees one
      // exists, so indexOf cannot return -1 here.
      i = src.indexOf('>', i + 1) + 1;
      continue;
    }
    // Collapse any run of whitespace to a single space, emitted lazily so a
    // trailing run never reaches the output.
    if (isSpace(ch)) {
      pendingSpace = text !== '';
      i += 1;
      continue;
    }
    // Drop the space before punctuation rather than emitting it.
    if (pendingSpace && !isTightPunctuation(ch)) text += ' ';
    pendingSpace = false;
    text += ch;
    i += 1;
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

/**
 * Check if the "<" character at position i begins an HTML tag.
 *
 * Returns true only if both conditions hold:
 * 1. The next character is a letter, "/" or "!" (so "< 5%" stays text)
 * 2. A ">" closes it before any further "<" (so "margins < 30% and volumes > 2m" isn't treated as one tag)
 */
function looksLikeTag(src: string, i: number): boolean {
  const next = src[i + 1];
  if (next === undefined) return false;
  const isName = (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z') || next === '/' || next === '!';
  if (!isName) return false;
  const close = src.indexOf('>', i + 1);
  if (close === -1) return false;
  const nextOpen = src.indexOf('<', i + 1);
  return nextOpen === -1 || nextOpen > close;
}

/** Check if a character is whitespace (space, tab, newline, carriage return, form feed, or vertical tab). */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/** Check if a character is punctuation that should not be preceded by a space (period, comma, exclamation, question, semicolon, colon). */
function isTightPunctuation(ch: string): boolean {
  return ch === '.' || ch === ',' || ch === '!' || ch === '?' || ch === ';' || ch === ':';
}

/** Check if a character is a sentence terminator (period, exclamation, or question mark). */
function isTerminator(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?';
}

/**
 * Extract the first N sentences from already-cleaned text, joined by a space.
 *
 * A sentence is a run of non-terminator characters followed by terminators.
 * Text with no terminator at all returns the whole string rather than nothing.
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

/** Check if a string is a well-formed HTTP or HTTPS URL (not a relative path, javascript:, or other scheme). */
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
    sentiment: mapSentiment(a.sentiment),
  };
}

/**
 * Read EODHD's `{ polarity, neg, neu, pos }` sentiment object into one of three
 * buckets, or null when there is nothing usable to read.
 *
 * Null covers every "we were not told" case — the field absent (plans without
 * sentiment), the object malformed, the polarity not a finite number — and is
 * deliberately NOT collapsed into 'neutral'. "The provider scored this story as
 * neutral" is a claim about the article; "the provider said nothing" is a claim
 * about the response. Presenting the second as the first would be inventing a
 * fact, which is the one thing this data path does not do.
 */
export function mapSentiment(raw: unknown): Sentiment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const polarity = (raw as { polarity?: unknown }).polarity;
  if (typeof polarity !== 'number' || !Number.isFinite(polarity)) return null;
  if (polarity >= SENTIMENT_THRESHOLD) return 'positive';
  if (polarity <= -SENTIMENT_THRESHOLD) return 'negative';
  return 'neutral';
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

/** Conservative allow-list: letters, digits, dot, hyphen — covers real tickers and exchange suffixes, nothing that could smuggle extra query params upstream. */
export function isValidTicker(ticker: string): boolean {
  return /^[A-Za-z0-9.-]{1,15}$/.test(ticker);
}
