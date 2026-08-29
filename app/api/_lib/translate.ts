/**
 * Hebrew translation for provider text, via DeepL — server-side only, so the
 * DeepL key stays where the EODHD one does and never reaches the browser.
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
 * If DeepL returns a different number of translations than we sent, the
 * mapping between input and output is no longer knowable, and pairing them by
 * index would put one article's headline on another. That is a fabrication,
 * so the whole batch is discarded instead.
 */

/** DeepL rejects a request carrying more than 50 texts. */
export const MAX_TEXTS_PER_REQUEST = 50;

/**
 * How many source strings the process-wide memo holds.
 *
 * The free plan allows 500,000 characters a month and a market feed is ~11,000
 * characters, so repeat work is the thing worth eliminating. Headlines repeat
 * heavily — the same story comes back on the next feed load, and the same
 * article is tagged with several watchlist tickers — and a Vercel function
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

/**
 * DeepL serves free keys and paid keys from different hosts, and answers a
 * key on the wrong host with an auth error. Free keys carry a `:fx` suffix,
 * which is the documented way to tell them apart — so a later upgrade to a
 * paid key is a dashboard change with no code change behind it.
 */
export function deeplEndpoint(apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

/** Parse `{ translations: [{ text }] }`, or null if the body is not that shape. */
function readTranslations(body: unknown, expected: number): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const list = (body as { translations?: unknown }).translations;
  if (!Array.isArray(list) || list.length !== expected) return null;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const text = (item as { text?: unknown }).text;
    // An empty string back is legitimate; a missing or non-string field is not.
    if (typeof text !== 'string') return null;
    out.push(text);
  }
  return out;
}

/** One POST of up to MAX_TEXTS_PER_REQUEST texts. Returns null on any failure. */
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const res = await fetchImpl(deeplEndpoint(apiKey), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        // DeepL's own scheme, not Bearer.
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // source_lang is pinned rather than auto-detected: the feed is English,
      // and detection on a three-word headline is a coin flip we don't need.
      body: JSON.stringify({ text: chunk, source_lang: 'EN', target_lang: 'HE' }),
    });
    if (!res.ok) {
      // 456 is DeepL's "quota exceeded" — an expected end-of-month state on
      // the free plan, and the reason this whole path degrades rather than
      // fails. Logged by status only: never the key, never the article text.
      console.error(`/api/news: translation failed — DeepL returned ${res.status}`);
      return null;
    }
    // Kept inside the timeout, like fetchUpstreamJson: fetch() resolves when
    // headers arrive, so a stalled body would otherwise hang past the budget.
    const body: unknown = await res.json();
    const translated = readTranslations(body, chunk.length);
    if (translated === null) {
      console.error('/api/news: translation failed — unexpected DeepL response shape');
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

  for (let start = 0; start < pending.length; start += MAX_TEXTS_PER_REQUEST) {
    const indices = pending.slice(start, start + MAX_TEXTS_PER_REQUEST);
    // The same string can appear twice in one batch (two feeds carrying one
    // story). Sending it once keeps the request smaller and the quota lower;
    // the results are written back to every index that asked for it.
    const unique = [...new Set(indices.map((i) => texts[i]))];
    const translated = await translateChunk(unique, apiKey, deadline - Date.now(), fetchImpl);
    if (translated === null) return null;
    // Written back from this chunk's own results rather than by re-reading the
    // memo, which is a cache and may have evicted an entry by the time we look.
    const bySource = new Map<string, string>();
    for (let u = 0; u < unique.length; u += 1) {
      bySource.set(unique[u], translated[u]);
      remember(unique[u], translated[u]);
    }
    for (const i of indices) out[i] = bySource.get(texts[i]) ?? texts[i];
  }
  return out;
}
