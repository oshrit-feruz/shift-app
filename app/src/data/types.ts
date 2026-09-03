/** Domain types shared by the data service and the UI. */

/**
 * A real-time quote for one ticker, from data/quotes.ts (Finnhub, via
 * /api/quote).
 *
 * Every field is required, which is the whole difference from the shape this
 * replaced. The old quote came from a daily snapshot of the screener engine
 * and had a nullable price, a nullable 52-week high and no day change at all,
 * so "priced" and "ranked but priceless" and "not ranked" were three states a
 * screen had to tell apart. A live quote is one state: either the provider
 * priced this symbol, in which case every number below is real, or it did
 * not, in which case the whole Quote is null and the screen shows "—".
 */
export interface Quote {
  /** Last traded price. */
  price: number;
  /** Day change in currency, signed. */
  change: number;
  /** Day change in percent, signed. */
  changePct: number;
  /** The previous session's close, which the day change is measured from. */
  prevClose: number;
  /** Today's session high, low and open. */
  dayHigh: number;
  dayLow: number;
  open: number;
  /** When the provider stamped this quote, as an ISO instant. */
  asOf: string;
}

/**
 * One real trading session, from the daily history route
 * (data/priceHistory.ts, /api/candles).
 *
 * No field here is nullable: the route drops a row that is missing any of
 * them rather than passing a half-bar through (api/_lib/eodhd.ts). A
 * candlestick needs all four prices to mean what it draws — a bar with a
 * guessed high is a lie in a shape a reader cannot see through, where a
 * guessed price at least renders as a number they could question.
 */
export interface Bar {
  /**
   * When the bar is. A daily bar carries its session date as raw YYYY-MM-DD;
   * an intraday one (data/intraday.ts) carries the full UTC instant its
   * five minutes began, as YYYY-MM-DDTHH:MM:SSZ. Both sort lexicographically
   * into chronological order, which is what every reader of this field does
   * with it; anything that renders it has to tell the two apart.
   */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * What is left of the design prototype's invented figures.
 *
 * They live behind their own key so no call site can render an invented
 * number while believing it is real: `x.demo.price` says what it is at the
 * point of use, where a flat `x.price` sitting beside a real one would not.
 * That naming is now the whole guard — the standing on-screen note was
 * removed, so nothing but the key tells a call site what it holds.
 *
 * The bag kept shrinking as sources arrived, and one field is left. Day change
 * went first (the live quote carries one). Market cap and P/E followed, to a
 * per-ticker route of their own (data/stats.ts), taking with them a forward
 * P/E that was `pe * 0.62` and three string constants that read the same
 * under every ticker in the app. Volume went to that same route, along with
 * the average it is measured against — the relative-volume column had been
 * computed from the length of the ticker symbol.
 */
export interface SymbolDemoStats {
  /**
   * The prototype's price, and the only field left in this bag.
   *
   * It is never rendered as *the* price — that comes from `SymbolInfo.quote`,
   * live — and exists solely to value the demo portfolio, whose share counts
   * and accounts are invented too. Pricing those at real prices would produce
   * a portfolio that is neither.
   *
   * Everything else has left, each to a real source: the day change to the
   * live quote, market cap and P/E to data/stats.ts, and volume to the same
   * route, which carries the session total and the average it is measured
   * against. `rsi` went unread, computed from real bars on the stock page.
   */
  price: number;
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
   * REAL, live, from /api/quote. Null when the provider does not price this
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
 * `quote` is real and live. There is no demo figure left on this row: the
 * day change used to be borrowed from the sample table for the handful of
 * tickers that had one and left null for everything else, and it now comes
 * from the quote itself for every ticker the provider prices.
 */
export interface WatchRow {
  ticker: string;
  /** Company name, or null for a ticker known to us only by its symbol. */
  name: string | null;
  sector: string | null;
  /** Beginner-mode plain-language description, when the sample table has one. */
  plain: { en: string; he: string } | null;
  /** REAL and live; null when the provider does not price this ticker. */
  quote: Quote | null;
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
  /**
   * The close the engine ranked on — the previous session's, since the
   * screener runs before the open. NOT rendered as a price anywhere: the
   * screens show the live quote beside a name (see PricedStockRadar), and a
   * day-old close next to a live one would read as a discrepancy.
   */
  price: number | null;
  /** 52-week high the drawdown is measured against. */
  high52w: number | null;
  /** How far below the 52-week high, in percent (positive = below). */
  drawdownPct: number | null;
  /** The engine's 0..1 composite ranking score. */
  compositeScore: number | null;
  /** The engine's verdict; null when it sent something we don't recognise. */
  signal: 'BUY' | 'WATCH' | 'SKIP' | null;
  /**
   * Whether the engine says this name is actionable NOW under its policy, as
   * opposed to merely on the list. A BUY can be inactive: the engine keeps the
   * verdict but its own rules say the money stays in the core for now. null
   * when the snapshot predates the field or the engine could not say — never
   * coerced to true, because "actionable" is the one thing this app must not
   * invent.
   */
  active: boolean | null;
}

/**
 * How the engine says the Stock Radar's budget is deployed — its sizing rule,
 * published with every snapshot so the app never has to hard-code it.
 * Percent of the Stock Radar budget per name, and how many names at most.
 */
export interface SatellitePolicy {
  sleevePctOfBudget: number;
  maxSleeves: number;
}

/**
 * One read of the mirror for the Stock Radar screens: the day's candidates
 * plus the engine's sizing policy. `policy` is null when the snapshot does not
 * carry one, in which case no per-name amount can honestly be shown.
 */
export interface StockRadar {
  signals: SatelliteSignal[];
  policy: SatellitePolicy | null;
}

/**
 * The Stock Radar as the screens read it: the engine's snapshot plus a LIVE
 * quote per actionable name, from /api/quote — the same source as every other
 * price in the app, so the price on a radar tile and the price on that stock's
 * own page are one number. A name the provider does not price, or a quote
 * read that failed, is simply absent from `quotes` and renders as "—"; the
 * engine's own last close is never shown in its place.
 */
export interface PricedStockRadar extends StockRadar {
  quotes: Record<string, Quote>;
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
   * The price the position is valued at, or `null` when there is none. For a
   * connected account it is the brokerage's own price; for the user's own
   * ledger it is the live quote. Carried so a "close this position" action
   * can offer the price the row was just valued at rather than a blank.
   */
  price: number | null;
  /**
   * What the position is worth now, or `null` when it cannot be priced — the
   * quote snapshot was unavailable, the ticker is outside the ranking, or it
   * is ranked with no price. Never 0 for any of those: a reader believes a
   * number and reads an em dash as the unknown it is.
   */
  value: number | null;
  /**
   * Return since purchase in currency, and the same as a percentage. Both are
   * `null` on the same unpriced cases as `value`. They are one fact in two
   * units, never computed from different bases: a manual position's pair
   * carries what selling already booked and what dividends paid, and a
   * brokerage position's pair is its open P&L — but within one row, the
   * money and the percent always describe the same thing.
   */
  pl: number | null;
  plPct: number | null;
  /**
   * Today's move on this position, in currency and as a percent of what it
   * was worth at the previous close — `shares × quote.change`, from the live
   * quote. `null` when there is no quote for the ticker. Never taken from a
   * brokerage snapshot, which carries no day change at all.
   */
  dayChange: number | null;
  dayChangePct: number | null;
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

/**
 * A US stock's key statistics, from data/stats.ts (EODHD, via /api/stats).
 *
 * Every field is nullable and every null is a real answer, not a gap: an ETF
 * has no P/E, a company that pays nothing has no dividend yield, and a
 * newly-listed one has no 52-week range yet. All of them render "—". The
 * whole object is null for a symbol the provider carries no extended quote
 * for, which is every non-US listing.
 *
 * `dividendYield` is a FRACTION — 0.0216 means 2.16%. The provider's own
 * field table calls it a percent and its example agrees; the live API does
 * not, and the live API is what ships. See api/_lib/eodhd.ts.
 *
 * There is deliberately no price here. This comes from the provider's
 * delayed feed, which is right for figures that move on the scale of
 * quarters and wrong for the one that moves every second — that stays
 * `Quote.price`, live, from a different provider entirely.
 */
export interface StockStats {
  marketCap: number | null;
  /** Trailing P/E. */
  pe: number | null;
  forwardPE: number | null;
  /** A fraction: 0.0216 is a 2.16% yield. */
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /**
   * The current session's cumulative volume and the provider's own average
   * daily volume. They travel together because the only thing built on them
   * is the ratio of one to the other — relative volume — and a ratio across
   * two providers or two moments would not mean that. See `relativeVolume`
   * in data/stats.ts, which is also where the caveat lives: `volume` is the
   * session so far, so the ratio runs low all morning by construction.
   */
  volume: number | null;
  averageVolume: number | null;
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
