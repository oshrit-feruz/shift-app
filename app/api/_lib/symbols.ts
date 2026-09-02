import { isValidTicker } from './news.js';

/**
 * Parse and validate a comma-separated `symbols` parameter.
 *
 * /api/quote and /api/stats both take one and both had this function
 * character for character. It is worth having once for the same reason the
 * failure classifier is: every branch below is a decision about what the
 * route promises, and two copies of a promise are two chances for one of them
 * to quietly stop keeping it.
 *
 * Returns the normalised list, or the error to answer with. Two decisions
 * inside it are the substance:
 *
 * DUPLICATES ARE COLLAPSED rather than fetched twice — a watchlist carrying
 * the same ticker twice must not cost two requests out of the minute's
 * allowance.
 *
 * A MALFORMED SYMBOL IS REFUSED rather than skipped. Silently dropping it
 * answers a shorter question than the one asked, and the caller cannot tell
 * that it happened.
 */
export function parseSymbolList(
  raw: string | undefined,
  max: number,
): { symbols: string[] } | { error: string } {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { error: 'Query param "symbols" is required.' };
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (parts.length === 0) return { error: 'Query param "symbols" is required.' };
  const seen = new Set<string>();
  for (const part of parts) {
    if (!isValidTicker(part)) return { error: 'A symbol contains unsupported characters.' };
    seen.add(part.toUpperCase());
  }
  const symbols = [...seen];
  if (symbols.length > max) return { error: `Ask for at most ${max} symbols at a time.` };
  return { symbols };
}
