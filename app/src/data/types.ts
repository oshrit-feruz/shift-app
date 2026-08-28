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
 * The market stats that are still demo figures, carried from the design
 * prototype.
 *
 * They live behind their own key so no call site can render an invented
 * number while believing it is real: `x.demo.changePct` says what it is at
 * the point of use, where a flat `x.changePct` sitting beside a real price
 * would not. Screens that show these carry <DemoDataNote /> as well.
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
}

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
  value: number;
  plPct: number;
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
  total: number;
  dayPct: number;
  allTimePct: number;
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
