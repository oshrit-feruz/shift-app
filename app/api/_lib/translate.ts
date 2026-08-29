/**
 * Hebrew translation for provider text, via Google Cloud Translation —
 * server-side only, so the translation key stays where the EODHD one does and
 * never reaches the browser. It travels as a query parameter (`key=`), which
 * this API requires, so it must never be logged or echoed either.
 *
 * BEST EFFORT, BY DESIGN.
 * Everything here answers `null` rather than throwing or half-succeeding, and
 * the caller then serves the untranslated original. That is deliberate and it
 * is not the silent-degradation pattern this app avoids elsewhere: the
 * articles are real, current and fetched successfully — only the wording is
 * the provider's English rather than Hebrew. Hiding real headlines behind an
 * "unavailable" screen because a *secondary* service is down would remove
 * information the reader could have used, and inventing a translation is not
 * on the table either. So: translate when we can, show the source language
 * when we cannot.
 *
 * NOTHING IS EVER PARTIALLY TRANSLATED FROM A BAD RESPONSE.
 * If the API returns a different number of translations than we sent, the
 * mapping between input and output is no longer knowable, and pairing them by
 * index would put one article's headline on another. That is a fabrication,
 * so the whole batch is discarded instead.
 */

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

/** Google rejects a request carrying more than 128 text segments. */
export const MAX_TEXTS_PER_REQUEST = 128;

/**
 * A second bound on one request, in characters.
 *
 * The segment cap is not the only limit — a request is bounded by total size
 * too, and 128 article summaries would be well past it. Kept comfortably below
 * the documented ceiling: nothing is gained by riding the edge, and one
 * oversized request would fail the whole batch into an English fallback.
 */
export const MAX_CHARS_PER_REQUEST = 20_000;

/**
 * How many source strings the process-wide memo holds.
 *
 * The free allowance is 500,000 characters a month and a market feed is
 * ~11,000 characters, so repeat work is the thing worth eliminating. Headlines
 * repeat heavily — the same story comes back on the next feed load, and the
 * same article is tagged with several watchlist tickers — and a Vercel function
 * instance is reused across invocations, so a small module-level map absorbs
 * most of that. 500 entries is a few hundred KB at most.
 */
const MEMO_MAX_ENTRIES = 500;

/**
 * Source text -> its Hebrew translation, for the lifetime of this function
 * instance. Only successful translations are stored: a failure must be retried
 * next time, not remembered.
 *
 * A Map iterates in insertion order, which makes the oldest key the first one
 * — so eviction is FIFO rather than LRU. Good enough here: entries expire by
 * being pushed out as news moves on, which is the same direction an LRU would
 * evict in for this access pattern.
 */
const memo = new Map<string, string>();

/** Drop everything memoised. Exists for tests, which must not leak state between cases. */
export function clearTranslationMemo(): void {
  memo.clear();
}

function remember(source: string, translated: string): void {
  if (memo.has(source)) return;
  if (memo.size >= MEMO_MAX_ENTRIES) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(source, translated);
}

/**
 * True if the text already contains a Hebrew letter (U+0590–U+05FF).
 *
 * Sending Hebrew to an EN->HE translation is at best a waste of quota and at
 * worst a garbled round trip. EODHD is an English-language feed, so this is a
 * cheap guard rather than a common case — but a single Hebrew-language source
 * appearing in the feed should not have its text mangled.
 */
export function isHebrew(text: string): boolean {
  return /[֐-׿]/.test(text);
}

/** The five XML predefined entities. Named entities beyond these do not appear in this API's output. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Undo the HTML escaping this API applies to its output.
 *
 * `translatedText` comes back with `&#39;`, `&amp;` and friends even when the
 * request asked for `format: 'text'` — a documented quirk of the v2 API. The
 * card renders the string as text, so an undecoded entity reaches the screen
 * literally: a headline would read "Nvidia&#39;s outlook" in Hebrew copy.
 *
 * Anything that is not a recognised entity is left exactly as written. A bare
 * "&" or a "&#" that starts nothing is ordinary text in a headline, and
 * rewriting it would corrupt a real string in the name of tidying one.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
    // Reject anything outside the Unicode range, and the surrogate block that
    // String.fromCodePoint would throw on.
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
    if (code >= 0xd800 && code <= 0xdfff) return whole;
    return String.fromCodePoint(code);
  });
}

/** Parse `{ data: { translations: [{ translatedText }] } }`, or null if the body is not that shape. */
function readTranslations(body: unknown, expected: number): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const list = (data as { translations?: unknown }).translations;
  // A length that does not match what we sent makes the pairing unknowable —
  // see the file header. Discard the batch rather than guess at the alignment.
  if (!Array.isArray(list) || list.length !== expected) return null;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const text = (item as { translatedText?: unknown }).translatedText;
    // An empty string back is legitimate; a missing or non-string field is not.
    if (typeof text !== 'string') return null;
    out.push(decodeEntities(text));
  }
  return out;
}

/** One POST of a single chunk. Returns null on any failure. */
async function translateChunk(
  chunk: string[],
  apiKey: string,
  remainingMs: number,
  fetchImpl: typeof fetch,
): Promise<string[] | null> {
  if (remainingMs <= 0) {
    console.error('/api/news: translation failed — budget spent before the request');
    return null;
  }
  const url = `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      // `source` is pinned rather than auto-detected: the feed is English, and
      // detection on a three-word headline is a coin flip we don't need.
      // `format: 'text'` because these are plain strings, not HTML fragments.
      body: JSON.stringify({ q: chunk, source: 'en', target: 'he', format: 'text' }),
    });
    if (!res.ok) {
      // 403 is the common operational one — quota spent, billing off, API not
      // enabled, or a key restricted away from this API — and the reason this
      // whole path degrades rather than fails. Logged by status only: the key
      // is in the URL, so neither it nor the article text goes anywhere near a
      // log line.
      console.error(`/api/news: translation failed — Google returned ${res.status}`);
      return null;
    }
    // Kept inside the timeout, like fetchUpstreamJson: fetch() resolves when
    // headers arrive, so a stalled body would otherwise hang past the budget.
    const body: unknown = await res.json();
    const translated = readTranslations(body, chunk.length);
    if (translated === null) {
      console.error('/api/news: translation failed — unexpected Google response shape');
      return null;
    }
    return translated;
  } catch (err) {
    console.error('/api/news: translation failed —', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Split texts into requests that respect BOTH bounds — segment count and total
 * characters. A single string longer than the character budget still goes out
 * on its own rather than being dropped or cut: the API's own limit is higher
 * than this budget, so an outsized headline is its own request, not a failure.
 */
export function chunkTexts(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of texts) {
    const tooMany = current.length >= MAX_TEXTS_PER_REQUEST;
    const tooLong = current.length > 0 && chars + text.length > MAX_CHARS_PER_REQUEST;
    if (tooMany || tooLong) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Translate a list of English strings to Hebrew, preserving order and length.
 *
 * Returns null if any part of it fails, so the caller keeps ALL the originals
 * rather than showing a feed half in each language. Never throws.
 *
 * Empty strings and text that is already Hebrew are passed through without
 * being sent upstream — a card with no excerpt should not spend quota.
 *
 * `timeoutMs` is one budget for the whole call, shared across chunks, so a
 * long feed cannot multiply the caller's deadline by the number of requests
 * it happens to need.
 */
export async function translateToHebrew(
  texts: string[],
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const deadline = Date.now() + timeoutMs;
  const out = [...texts];

  // Indices still needing an upstream translation, after passthrough and memo.
  const pending: number[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i];
    if (text === '' || isHebrew(text)) continue;
    const cached = memo.get(text);
    if (cached !== undefined) {
      out[i] = cached;
      continue;
    }
    pending.push(i);
  }
  if (pending.length === 0) return out;

  // The same string can appear more than once in a batch (two feeds carrying
  // one story). It is sent once, and the result is written back to every index
  // that asked for it — smaller requests, and less of the monthly allowance.
  const unique = [...new Set(pending.map((i) => texts[i]))];
  const bySource = new Map<string, string>();

  for (const chunk of chunkTexts(unique)) {
    const translated = await translateChunk(chunk, apiKey, deadline - Date.now(), fetchImpl);
    if (translated === null) return null;
    for (let c = 0; c < chunk.length; c += 1) {
      // Collected here as well as memoised, because the memo is a cache and may
      // have evicted an entry by the time the write-back below reads it.
      bySource.set(chunk[c], translated[c]);
      remember(chunk[c], translated[c]);
    }
  }
  for (const i of pending) out[i] = bySource.get(texts[i]) ?? texts[i];
  return out;
}
