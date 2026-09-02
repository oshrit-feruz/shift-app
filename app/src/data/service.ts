import type {
  Bar,
  EarningsEvent,
  Loadable,
  NewsItem,
  PortfolioSummary,
  Holding,
  PricedStockRadar,
  SatelliteSignal,
  SymbolInfo,
  WatchRow,
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
  /**
   * Rows for an arbitrary list of tickers, in the order given — the user's
   * watchlist. Unlike `symbols()` this is not restricted to the sample table:
   * a ticker with no row there comes back described by what is actually known
   * about it (see WatchRow). An empty list is ok([]), with no fetch at all.
   */
  watchRows(tickers: string[]): Promise<Loadable<WatchRow[]>>;
  /**
   * Everything a user can put on their watchlist: the sample table plus every
   * symbol in the engine's daily ranking, plus any ticker in `include` that
   * neither covers. Backs ticker search, which passes the user's watchlist so
   * a symbol the ranking has since dropped is still listed — and can still be
   * un-followed.
   */
  searchUniverse(include?: string[]): Promise<Loadable<WatchRow[]>>;
  /** Live positions currently held by the Recovery Detector engine. */
  satelliteSignals(): Promise<Loadable<SatelliteSignal[]>>;
  /**
   * The Stock Radar screens' read: the same candidates as satelliteSignals
   * plus the engine's sizing policy, from one snapshot, so the amount shown
   * against a name and the name itself can never come from different days —
   * priced LIVE per actionable name from the same quote source as every
   * other screen (see PricedStockRadar).
   */
  stockRadar(): Promise<Loadable<PricedStockRadar>>;
  portfolios(): Promise<Loadable<PortfolioSummary[]>>;
  holdings(portfolioId: string): Promise<Loadable<Holding[]>>;
  news(): Promise<Loadable<NewsItem[]>>;
  earnings(): Promise<Loadable<EarningsEvent[]>>;
  /**
   * REAL daily price history for one ticker, from the mirror
   * (data/priceHistory.ts). ok(null) means the mirror publishes nothing for
   * this symbol — a real answer, not a failure.
   */
  dailySeries(ticker: string): Promise<Loadable<Bar[] | null>>;
  /**
   * DEMO seeded walk. What is left of the prototype's chart data now that the
   * stock page and the movers draw real bars: the portfolio's value history
   * and its benchmark, neither of which can be real until the transactions
   * behind them are. Never use this for a single stock's price action —
   * `dailySeries` is real, and a screen mixing the two would be showing
   * invented price history beside actual sessions.
   */
  series(key: string, n: number, drift: number, vol: number): number[];
}
