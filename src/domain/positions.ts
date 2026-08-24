import type { RawPosition } from '../api/types';

/**
 * Tolerant mapping of API positions to display models. The live
 * `open_positions` array was empty when this client was built, so exact
 * field names are unverified; each field probes the likely spellings and
 * comes back null when absent. Nulls render as "—" — a missing value is
 * shown as missing, never invented.
 */

export interface OpenPosition {
  ticker: string;
  entryDate: string | null;
  daysHeld: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  changePct: number | null;
}

function pickNumber(raw: RawPosition, keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function pickString(raw: RawPosition, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

export function mapOpenPosition(raw: RawPosition): OpenPosition {
  const entryPrice = pickNumber(raw, ['entry_price', 'entry', 'open_price', 'buy_price']);
  const currentPrice = pickNumber(raw, ['current_price', 'price', 'last', 'last_price', 'close']);
  let changePct = pickNumber(raw, ['change_pct', 'return_pct', 'pct_change', 'pnl_pct', 'gain_pct']);
  if (changePct === null && entryPrice !== null && currentPrice !== null && entryPrice !== 0) {
    changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
  }
  return {
    ticker: pickString(raw, ['ticker', 'symbol']) ?? '—',
    entryDate: pickString(raw, ['entry_date', 'entered_at', 'opened_at', 'open_date', 'buy_date']),
    daysHeld: pickNumber(raw, ['days_held', 'day', 'holding_days', 'days']),
    entryPrice,
    currentPrice,
    changePct,
  };
}

/** Worst realized return across closed positions, in percent (negative =
 *  loss). Null when no closed position exposes a usable return — the UI
 *  then says the live history is insufficient rather than guessing. */
export function worstRealizedReturnPct(closed: RawPosition[]): number | null {
  let worst: number | null = null;
  for (const raw of closed) {
    let pct = pickNumber(raw, ['return_pct', 'pnl_pct', 'change_pct', 'gain_pct']);
    if (pct === null) {
      const entry = pickNumber(raw, ['entry_price', 'entry', 'open_price', 'buy_price']);
      const exit = pickNumber(raw, ['exit_price', 'close_price', 'sell_price', 'final_price']);
      if (entry !== null && exit !== null && entry !== 0) {
        pct = ((exit - entry) / entry) * 100;
      }
    }
    if (pct !== null && (worst === null || pct < worst)) worst = pct;
  }
  return worst;
}
