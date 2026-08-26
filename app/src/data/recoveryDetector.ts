/**
 * LIVE data source — Recovery Detector engine.
 *
 * This is the one surface in the app wired to a real API; everything else
 * still comes from the clearly-labeled demo adapter. It backs the Satellite
 * card on the recommendation screen.
 *
 * WHICH ENDPOINT AND WHY:
 * The engine exposes both /api/screener (today's ranked candidates) and
 * /api/beta/dashboard (the beta paper-trading book). The card shows the
 * screener's BUY signals, because the dashboard's `open_positions` only fills
 * once someone actually opens a position via POST /api/positions/open — until
 * then it is legitimately empty, and an empty card is not what this surface is
 * for. The screener recomputes daily and is the engine's actual output.
 *
 * DATA HONESTY CONTRACT (this file is the reason the contract exists):
 * - A successful response with zero BUY signals returns ok([]) — the UI then
 *   shows the honest "no candidates today" empty state. Zero signals is a
 *   real, expected answer from this engine on a quiet day, NOT an error.
 * - Any failure — network, CORS, timeout, non-2xx, unparseable body, or a
 *   body whose shape we do not recognise — returns 'unavailable'. It must
 *   NEVER fall back to demo numbers: showing invented tickers as if the
 *   engine had picked them is the exact failure mode switching to live data
 *   is meant to eliminate.
 * - Individual missing numeric fields become null, and render as "—".
 *   A candidate with an unknown price is shown with an unknown price; the
 *   number is never guessed or back-filled.
 */

import { ok, unavailable, type Loadable, type SatelliteSignal } from './types';

export const RECOVERY_DETECTOR_URL =
  'https://stock-screener-7lvr.onrender.com/api/screener';

/**
 * The engine is hosted on Render's free tier, which spins instances down when
 * idle; an observed cold start exceeded 45s, so this ceiling is generous on
 * purpose — long enough to survive a spin-up, short enough not to hang the
 * card forever.
 */
const TIMEOUT_MS = 60_000;

/** Accepts a number or a numeric string; anything else (or non-finite) → null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    // Tolerate "$123.45" / "1,234.5" shaped values without inventing anything.
    const cleaned = trimmed.replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** First non-empty string among the candidate keys. */
function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** First parseable number among the candidate keys. */
function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (k in row) {
      const n = toNumber(row[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Map one raw screener row to a SatelliteSignal.
 * Field-name variants are accepted defensively because the engine's payload
 * shape is not contractually frozen. Returns null when the row has no usable
 * ticker — a candidate with no identity cannot be rendered or navigated to.
 */
export function mapSignal(raw: unknown): SatelliteSignal | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const ticker = pickString(row, ['ticker', 'symbol']);
  if (!ticker) return null;

  // An unrecognised verdict is reported as-is rather than coerced to BUY.
  const rawSignal = pickString(row, ['signal']);
  const signal =
    rawSignal === 'BUY' || rawSignal === 'WATCH' || rawSignal === 'SKIP' ? rawSignal : null;

  return {
    ticker: ticker.toUpperCase(),
    price: pickNumber(row, ['price', 'current_price', 'last']),
    high52w: pickNumber(row, ['high_52w', 'high52w']),
    drawdownPct: pickNumber(row, ['drawdown_pct', 'drawdown']),
    compositeScore: pickNumber(row, ['composite_score', 'score']),
    signal,
  };
}

/**
 * Extract the BUY candidates from a parsed screener body.
 *
 * Prefers the engine's own `buy_signals` list. Falls back to filtering
 * `full_ranking` for signal === 'BUY' only when `buy_signals` is absent —
 * that is a derivation from data the engine actually sent, not an invention.
 * Returns null when neither array is present: we cannot honestly report
 * "no candidates today" from a response we do not understand, so that case is
 * surfaced as 'unavailable' by the caller.
 */
export function extractBuySignals(body: unknown): SatelliteSignal[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  const buys = obj.buy_signals;
  if (Array.isArray(buys)) {
    return buys.map(mapSignal).filter((s): s is SatelliteSignal => s !== null);
  }

  const ranking = obj.full_ranking;
  if (Array.isArray(ranking)) {
    return ranking
      .map(mapSignal)
      .filter((s): s is SatelliteSignal => s !== null && s.signal === 'BUY');
  }

  return null;
}

/** Fetch the engine's current BUY candidates. Never throws. */
export async function fetchSatelliteSignals(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<SatelliteSignal[]>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(RECOVERY_DETECTOR_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return unavailable();

    const body: unknown = await res.json();
    const signals = extractBuySignals(body);
    // Unrecognised shape → unavailable, never a fabricated empty list.
    if (signals === null) return unavailable();
    // A genuinely empty list is a valid answer and renders as the empty state.
    return ok(signals);
  } catch {
    // Network failure, CORS rejection, abort/timeout, invalid JSON — all
    // honestly 'unavailable'. Deliberately no demo fallback.
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}
