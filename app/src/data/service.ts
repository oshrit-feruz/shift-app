import type {
  AnalystConsensus,
  EarningsEvent,
  Loadable,
  LongTermAccount,
  NewsItem,
  NextEarnings,
  PortfolioMetrics,
  PortfolioSummary,
  Holding,
  SatellitePosition,
  StockStats,
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
  satellitePositions(): Promise<Loadable<SatellitePosition[]>>;
  portfolios(): Promise<Loadable<PortfolioSummary[]>>;
  holdings(portfolioId: string): Promise<Loadable<Holding[]>>;
  news(): Promise<Loadable<NewsItem[]>>;
  /** Stories for one ticker only — ok([]) when none (rendered as honestly empty). */
  stockNews(ticker: string): Promise<Loadable<NewsItem[]>>;
  earnings(): Promise<Loadable<EarningsEvent[]>>;
  stockStats(ticker: string): Promise<Loadable<StockStats>>;
  analystConsensus(ticker: string): Promise<Loadable<AnalystConsensus>>;
  nextEarnings(ticker: string): Promise<Loadable<NextEarnings | null>>;
  portfolioMetrics(): Promise<Loadable<PortfolioMetrics>>;
  /** Long-term savings totals by kind — totals only, never holdings. */
  longTermAccounts(): Promise<Loadable<LongTermAccount[]>>;
  /** Daily close series for charts (seeded/demo or real). */
  series(key: string, n: number, drift: number, vol: number): number[];
}
