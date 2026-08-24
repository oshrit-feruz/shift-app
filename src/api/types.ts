/** Shapes verified live against https://stock-screener-7lvr.onrender.com
 *  on 2026-08-24. `open_positions` / `closed_positions` were empty at the
 *  time, so per-position fields are untyped here — see domain/positions.ts
 *  for the tolerant mapping. */

export interface DashboardSummary {
  total_opened: number;
  open: number;
  closed: number;
  closed_aggregate: unknown;
}

export type RawPosition = Record<string, unknown>;

export interface ScreenerEntry {
  ticker: string;
  price: number;
  high_52w: number;
  drawdown_pct: number;
  composite_score: number;
  dip_score: number;
  momentum_score: number;
  volume_score: number;
  gate: boolean;
  signal: string;
  veto_reason: string | null;
}

export interface ScreenerResponse {
  as_of: string;
  computed_on: string;
  buy_signals: ScreenerEntry[];
  full_ranking: ScreenerEntry[];
}

export interface DashboardResponse {
  as_of_date: string;
  beta_start: string | null;
  hold_target_days: number;
  summary: DashboardSummary;
  open_positions: RawPosition[];
  closed_positions: RawPosition[];
}
