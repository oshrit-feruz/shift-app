import type {
  EarningsEvent,
  Loadable,
  NewsItem,
  PortfolioSummary,
  Holding,
  SatelliteSignal,
  SymbolInfo,
} from './types';

/**
 * The one seam between UI and market data. A real backend drops in by
 * implementing this interface; the UI already renders loading / unavailable /
 * empty states for every method, so no screen changes are needed.
 *
 * DATA HONESTY CONTRACT: an implementation must never fabricate values. If a
 * source fails, return { status: 'unavailable' } — the UI shows an honest
 * "unavailable" state. An empty list (e.g. no open satellite positions) is
 * returned as ok([]) and rendered as genuinely empty.
 */
export interface DataService {
  symbols(): Promise<Loadable<SymbolInfo[]>>;
  symbol(ticker: string): Promise<Loadable<SymbolInfo>>;
  /** Live positions currently held by the Recovery Detector engine. */
  satelliteSignals(): Promise<Loadable<SatelliteSignal[]>>;
  portfolios(): Promise<Loadable<PortfolioSummary[]>>;
  holdings(portfolioId: string): Promise<Loadable<Holding[]>>;
  news(): Promise<Loadable<NewsItem[]>>;
  earnings(): Promise<Loadable<EarningsEvent[]>>;
  /** Daily close series for charts (seeded/demo or real). */
  series(key: string, n: number, drift: number, vol: number): number[];
}
