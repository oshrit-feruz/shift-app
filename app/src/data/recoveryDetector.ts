/**
 * LIVE data source — Recovery Detector engine.
 *
 * This is the one surface in the app wired to a real API; everything else
 * still comes from the clearly-labeled demo adapter. It backs the Satellite
 * "current positions" card on the recommendation screen.
 *
 * DATA HONESTY CONTRACT (this file is the reason the contract exists):
 * - A successful response with zero open positions returns ok([]) — the UI
 *   then shows the honest "אין פוזיציות פתוחות כרגע" empty state. Zero
 *   positions is a real, expected answer from this engine, NOT an error.
 * - Any failure — network, CORS, timeout, non-2xx, unparseable body, or a
 *   body whose shape we do not recognise — returns 'unavailable'. It must
 *   NEVER fall back to demo numbers: showing invented positions as if the
 *   engine held them is the exact failure mode switching to live data is
 *   meant to eliminate.
 * - Individual missing numeric fields become null, and render as "—".
 *   A position with an unknown price is shown as a position with an unknown
 *   price; the number is never guessed or back-filled.
 */

import { ok, unavailable, type Loadable, type SatellitePosition } from './types';

export const RECOVERY_DETECTOR_URL =
  'https://stock-screener-7lvr.onrender.com/api/beta/dashboard';

/**
 * The engine is hosted on Render's free tier, which spins instances down when
 * idle; a cold start can take tens of seconds. This is the ceiling before we
 * give up and show 'unavailable' — long enough to survive a warm-ish start,
 * short enough not to hang the card indefinitely.
 */
const TIMEOUT_MS = 15_000;

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
 * Map one raw API row to a SatellitePosition.
 * Field-name variants are accepted defensively because the engine's payload
 * shape is not contractually frozen. Returns null when the row has no usable
 * ticker — a position with no identity cannot be rendered or navigated to.
 */
export function mapPosition(raw: unknown): SatellitePosition | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const ticker = pickString(row, ['ticker', 'symbol']);
  if (!ticker) return null;

  return {
    ticker: ticker.toUpperCase(),
    entryPrice: pickNumber(row, ['entry_price', 'entry']),
    currentPrice: pickNumber(row, ['current_price', 'price', 'last']),
  };
}

/**
 * Extract the positions array from a parsed dashboard body.
 * Returns null when the body does not carry a recognisable `open_positions`
 * array — we cannot honestly report "zero open positions" from a response we
 * do not understand, so that case is surfaced as 'unavailable' by the caller.
 */
export function extractOpenPositions(body: unknown): SatellitePosition[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).open_positions;
  if (!Array.isArray(raw)) return null;
  return raw.map(mapPosition).filter((p): p is SatellitePosition => p !== null);
}

/** Fetch the engine's currently open positions. Never throws. */
export async function fetchSatellitePositions(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<SatellitePosition[]>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(RECOVERY_DETECTOR_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return unavailable();

    const body: unknown = await res.json();
    const positions = extractOpenPositions(body);
    // Unrecognised shape → unavailable, never a fabricated empty list.
    if (positions === null) return unavailable();
    // A genuinely empty list is a valid answer and renders as the empty state.
    return ok(positions);
  } catch {
    // Network failure, CORS rejection, abort/timeout, invalid JSON — all
    // honestly 'unavailable'. Deliberately no demo fallback.
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}
