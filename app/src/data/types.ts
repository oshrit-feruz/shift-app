/** Domain types shared by the data service and the UI. */

/**
 * Real market numbers for one ticker, read from the daily mirror
 * (data/recoveryDetector.ts). Every field is nullable for the same reason
 * SatelliteSignal's are: the mirror ranks 100 names and the app can open any
 * symbol, so "we do not have this number" is a normal answer that renders as
 * "—" rather than being guessed or back-filled.
 */
export interface Quote {
  /** Last close the engine saw. */
  price: number | null;
  /** 52-week high the drawdown is measured against. */
  high52w: number | null;
  /** How far below the 52-week high, in percent (positive = below). */
  drawdownPct: number | null;
}

/**
 * One real trading session, from the daily price-history mirror
 * (data/priceHistory.ts).
 *
 * Unlike Quote, no field here is nullable: the publisher drops a row that is
 * missing any of them rather than passing a half-bar through
 * (scripts/mirror-prices.mjs). A candlestick needs all four prices to mean
 * what it draws — a bar with a guessed high is a lie in a shape a reader
 * cannot see through, where a guessed price at least renders as a number they
 * could question.
 */
export interface Bar {
  /** Session date, raw YYYY-MM-DD. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * The market stats that are still demo figures, carried from the design
 * prototype.
 *
 * They live behind their own key so no call site can render an invented
 * number while believing it is real: `x.demo.changePct` says what it is at
 * the point of use, where a flat `x.changePct` sitting beside a real price
 * would not. That naming is now the whole guard — the standing on-screen
 * note was removed, so nothing but the key tells a call site what it holds.
 *
 * Day change is the notable absence from Quote: the mirrored ranking has no
 * day-change field, so it cannot be made real from this source and is not
 * borrowed from anywhere either — it stays here until an intraday quote
 * source exists.
 */
export interface SymbolDemoStats {
  /** Prototype price. Kept only as the basis for the other demo figures and
   *  for the demo portfolio's valuation — never rendered as *the* price,
   *  which comes from `SymbolInfo.quote`. */
  price: number;
  changePct: number; // day change, signed
  volume: string;
  marketCap: string;
  pe: number;
  rsi: number;
}

/**
 * One tradable symbol: static description plus its numbers, split by
 * provenance — `quote` is real, `demo` is not.
 */
export interface SymbolInfo {
  ticker: string;
  name: string;
  sector: string;
  /** Beginner-mode plain-language description (per language). */
  plain: { en: string; he: string };
  /** Beginner-mode "why it moved" line (per language). */
  why: { en: string; he: string };
  /**
   * REAL, from the daily mirror. Null when the mirror does not cover this
   * ticker or could not be read — the UI renders "—", never a demo price.
   */
  quote: Quote | null;
  /** DEMO. See SymbolDemoStats. */
  demo: SymbolDemoStats;
}

/**
 * One row of the user's own watchlist, or one result in ticker search.
 *
 * Deliberately NOT SymbolInfo. The watchlist is the user's to fill, and they
 * can put any symbol on it — including one the app's ten-row sample table has
 * never heard of. SymbolInfo cannot describe such a ticker without inventing a
 * name, a sector and six demo statistics for it, so this type makes every
 * borrowed field nullable instead and each renders as "—" or is simply
 * omitted.
 *
 * `quote` is real (the daily mirror). `demoChangePct` is the one demo figure
 * carried over, and only for the sample-table tickers that have one — it is
 * null for everything else rather than fabricated, which is why it keeps the
 * `demo` prefix at the point of use.
 */
export interface WatchRow {
  ticker: string;
  /** Company name, or null for a ticker known to us only by its symbol. */
  name: string | null;
  sector: string | null;
  /** Beginner-mode plain-language description, when the sample table has one. */
  plain: { en: string; he: string } | null;
  /** REAL, from the daily mirror; null when the mirror does not cover it. */
  quote: Quote | null;
  /** DEMO day change, only for tickers in the sample table. */
  demoChangePct: number | null;
  /** True when the ticker appears in the engine's daily ranking. */
  ranked: boolean;
}

/**
 * A candidate surfaced by the Recovery Detector screener.
 * Every number is nullable on purpose: this comes from a live API whose rows
 * may omit a field, and an absent number renders as "—" rather than being
 * guessed or back-filled (see data/recoveryDetector.ts).
 */
export interface SatelliteSignal {
  ticker: string;
  /** Last price the engine saw. */
  price: number | null;
  /** 52-week high the drawdown is measured against. */
  high52w: number | null;
  /** How far below the 52-week high, in percent (positive = below). */
  drawdownPct: number | null;
  /** The engine's 0..1 composite ranking score. */
  compositeScore: number | null;
  /** The engine's verdict; null when it sent something we don't recognise. */
  signal: 'BUY' | 'WATCH' | 'SKIP' | null;
}

/**
 * Fundamental highlights for one ticker, straight from SEC EDGAR via the
 * engine's /api/stock/{ticker}/fundamentals route.
 *
 * The engine's contract is an honest-status one: 'ok' carries real filed
 * figures with the filing that reported them, and anything missing or
 * unparsable comes back 'unavailable' with a reason — never an estimated or
 * fabricated number. That maps onto this app's Loadable directly, so the
 * screen branches on the engine's own status rather than second-guessing it.
 *
 * `filed` and `form` are not decoration: the engine documents this figure as
 * display-only and explicitly NOT point-in-time (it is the newest filing on
 * record, with no reporting lag applied). Showing which filing a number came
 * from is what keeps that honest, so the UI must never render `revenue`
 * without it.
 */
export interface Fundamentals {
  ticker: string;
  /** Most recent annual revenue on file, in whole currency units. */
  revenue: number | null;
  /** Period end the revenue figure covers, as the engine's raw YYYY-MM-DD. */
  periodEnd: string | null;
  /** Year-over-year change in revenue, in percent (signed). */
  yoyPct: number | null;
  /**
   * Date the source filing was filed with the SEC, raw YYYY-MM-DD, and the
   * form it came from. Non-null on purpose: a revenue figure with no filing
   * behind it is not a "filed result" and must not be presented as one, so
   * the parser rejects such a payload outright (→ unavailable) rather than
   * letting a number reach the screen with its provenance shrugged off as
   * "—". This is the type-level enforcement of the rule above.
   */
  filed: string;
  /** SEC form type the figure came from, e.g. '10-K'. */
  form: string;
  /** Provenance string from the engine, e.g. 'SEC EDGAR companyfacts'. */
  source: string | null;
}

/**
 * One real headline from the /api/news Vercel function.
 *
 * `summary` is a 1-2 sentence excerpt, never the full article body — the
 * function enforces that server-side for copyright reasons, and the UI must
 * not try to render more than this carries. `url` is the external article.
 */
export interface StockNewsArticle {
  headline: string;
  source: string;
  /** Raw ISO timestamp from the provider. */
  publishedAt: string;
  summary: string;
  url: string;
  /**
   * Tickers the provider tagged the article with. Only populated on the
   * general market feed, where the story's subject is not already known from
   * the request. Empty is normal — a rate decision or a sector piece is
   * about no single company, and inventing a ticker for it would be a
   * fabrication.
   */
  symbols: string[];
  /**
   * How the provider scored the story's tone, or null when it did not score
   * it at all — the sentiment field is not on every EODHD plan or every row.
   * Null is rendered as no tag: "we were not told" is not the same claim as
   * "the provider called this neutral", and only one of them is ours to make.
   */
  sentiment: NewsSentiment | null;
}

/** The provider's tone score, bucketed. See StockNewsArticle.sentiment. */
export type NewsSentiment = 'positive' | 'negative' | 'neutral';

/**
 * One company's scheduled or reported quarter, from the earnings calendar.
 *
 * `actual` and `surprisePct` are null for a quarter that has not been
 * reported yet — the normal state for anything on the upcoming calendar, and
 * not a defect. `estimate` is null when a company has no published consensus.
 * All three render as "—" rather than being filled in.
 */
export interface EarningsRow {
  ticker: string;
  /** Date results were announced, raw YYYY-MM-DD. */
  reportDate: string;
  /** Fiscal period the results cover, raw YYYY-MM-DD, or null. */
  periodEnd: string | null;
  /** Before market open / after market close, or null when unstated. */
  timing: 'BMO' | 'AMC' | null;
  actual: number | null;
  estimate: number | null;
  surprisePct: number | null;
}

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  /**
   * What the position is worth now, or `null` when it cannot be priced — the
   * quote snapshot was unavailable, the ticker is outside the ranking, or it
   * is ranked with no price. Never 0 for any of those: a reader believes a
   * number and reads an em dash as the unknown it is.
   */
  value: number | null;
  /** Total return, or `null` on the same three unpriced cases. */
  plPct: number | null;
  /**
   * What the shares still held cost: `shares * avgCost`.
   *
   * A number, never null, and that is the point of carrying it separately
   * from `value`. What someone paid is their own arithmetic over their own
   * ledger — the market cannot make it unknown — so a holding the provider
   * could not price still says what it cost, beside a worth that reads "—".
   */
  costBasis: number;
}

export type PortfolioKind = 'aggregate' | 'linked' | 'manual' | 'institution';

export interface PortfolioSummary {
  id: string;
  kind: PortfolioKind;
  name: string;
  broker: string | null;
  logo: string | null;
  acct: string;
  syncedAgo: { en: string; he: string } | null;
  /**
   * Market value, or `null` when it is not known — a manual portfolio with a
   * holding the price mirror does not cover has no knowable total, and the
   * sum of the legs it *can* price is not a smaller total, it is a wrong one.
   */
  total: number | null;
  /** Day change, `null` when unknown. A manual ledger has no priced history. */
  dayPct: number | null;
  /** All-time change, `null` when unknown. */
  allTimePct: number | null;
  /** institution kind label key suffix: 'pension' | 'hisht' | 'bank' */
  institution?: 'pension' | 'hisht' | 'bank';
}

export interface AllocationSlice {
  label: string;
  pct: number;
  colorVar: string; // CSS var reference, e.g. 'var(--color-accent)'
}

export interface NewsItem {
  time: string;
  source: string;
  ticker: string;
  headline: string;
  tag: string;
  changePct: number;
  summary: string;
  /** The full story behind the headline, shown when a card is opened. */
  body: string;
}

export interface EarningsEvent {
  date: string; // e.g. 'Mon 25'
  when: 'AMC' | 'BMO';
  ticker: string;
  name: string;
  mktCap: string;
  epsEst: string;
  revEst: string;
  impliedMove: string;
  /** Signed surprise from the company's last reported quarter, e.g. '+8.1%'. */
  lastSurprise: string;
}

export interface ActiveAlert {
  glyph: string;
  title: { en: string; he: string };
  detail: { en: string; he: string };
}

export interface AppNotification {
  glyph: string;
  title: { en: string; he: string };
  detail: { en: string; he: string };
  ago: { en: string; he: string };
  ticker: string;
  unread: boolean;
  /** Threshold alerts are informational-only and render with the fixed disclaimer. */
  isThresholdAlert?: boolean;
}

export interface InstitutionProvider {
  name: { en: string; he: string };
  logo: string | null;
}

export interface InstitutionKind {
  key: 'broker' | 'bank' | 'pension' | 'hisht';
  initial: { en: string; he: string };
  providers: InstitutionProvider[];
}

export interface BrokerOption {
  key: 'blink' | 'ibkr' | 'colmex';
  name: string;
  logo: string;
  help: { en: string; he: string };
}

export interface LongTermAccount {
  key: 'pension' | 'hisht' | 'bank';
  total: number;
  ytdPct: number | null;
}

/**
 * Honest async state. UI must render all three shapes — never substitute a
 * fabricated number for 'loading' or 'unavailable'.
 */
export type Loadable<T> =
  | { status: 'loading' }
  /**
   * `reason` is an optional, already-human-readable explanation of *why* this
   * is unavailable — e.g. "the snapshot is 9 days old". It is shown to the
   * user in place of the generic help text, so it must never carry a raw
   * error string or anything a caller would have to interpret. Omit it and
   * the generic copy is used, which is right for the common case where the
   * only honest thing to say is "we could not load this".
   *
   * Bilingual for the same reason PortfolioSummary.syncedAgo is: this text
   * reaches a Hebrew-first UI, and the data layer has no access to the
   * i18n hooks, so it carries both languages and the component picks one.
   */
  | { status: 'unavailable'; reason?: { en: string; he: string } }
  | { status: 'ok'; data: T };

/** Create a loading state for a Loadable. */
export const loading = <T>(): Loadable<T> => ({ status: 'loading' });

/** Create an unavailable state for a Loadable, optionally with a bilingual reason explaining why. */
export const unavailable = <T>(reason?: { en: string; he: string }): Loadable<T> => ({
  status: 'unavailable',
  reason,
});

/** Create a successful state for a Loadable with the given data. */
export const ok = <T>(data: T): Loadable<T> => ({ status: 'ok', data });

/**
 * One real brokerage position as /api/snaptrade reports it. Every number is
 * nullable for the same reason SatelliteSignal's are: this comes from a live
 * brokerage via SnapTrade, whose coverage of any given field varies by broker,
 * and an absent number renders as "—" rather than being guessed or zeroed.
 */
export interface ConnectedPosition {
  ticker: string;
  description: string | null;
  units: number | null;
  price: number | null;
  marketValue: number | null;
  avgCost: number | null;
  openPnl: number | null;
  currency: string | null;
}

export interface ConnectedBalance {
  currency: string | null;
  cash: number | null;
  buyingPower: number | null;
}

/**
 * One real, read-only brokerage account pulled through the founder-demo
 * SnapTrade Personal integration. The account number arrives already masked —
 * the full number never leaves the server.
 */
export interface ConnectedAccount {
  id: string;
  name: string | null;
  numberMasked: string | null;
  institution: string | null;
  currency: string | null;
  totalValue: number | null;
  balances: ConnectedBalance[];
  positions: ConnectedPosition[];
  /**
   * When the brokerage data behind these positions was fetched, from
   * SnapTrade's `data_freshness.as_of`. Null when it did not say — the screen
   * then shows no freshness claim at all rather than implying "live".
   */
  asOf: string | null;
  /**
   * Which route answered: the daily cache, or the per-connection real-time
   * one used when the cache had nothing yet.
   */
  source: 'daily' | 'realtime';
}

/**
 * One SnapTrade connection, reported so a zero-account answer can say which
 * state it is in. A live connection whose brokerage reports no accounts and
 * no connection at all are different facts; both used to render identically.
 */
export interface ConnectedConnection {
  id: string;
  brokerage: string | null;
  disabled: boolean | null;
  type: string | null;
  dataFreshnessMode: string | null;
  accountCount: number;
}

/**
 * What /api/snaptrade reports: the accounts it could read, plus the
 * connections behind them. `connections` is only populated when the accounts
 * list came back empty and the real-time route was walked — it is what the
 * screen uses to tell "nothing connected" from "connected, reporting nothing".
 */
export interface ConnectedAccountsResult {
  accounts: ConnectedAccount[];
  connections: ConnectedConnection[];
}
