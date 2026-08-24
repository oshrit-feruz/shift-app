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

export interface DashboardResponse {
  as_of_date: string;
  beta_start: string | null;
  hold_target_days: number;
  summary: DashboardSummary;
  open_positions: RawPosition[];
  closed_positions: RawPosition[];
}
