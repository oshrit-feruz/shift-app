/**
 * DEMO DATA ADAPTER — every number here is demonstration data carried over
 * from the design prototype.
 *
 * TWO EXCEPTIONS, both reading the daily mirror in data/recoveryDetector.ts
 * and neither ever returning demo data — not on failure, not on an empty
 * result:
 *   1. `satelliteSignals()` — the engine's BUY candidates.
 *   2. Every price this adapter hands out. `symbols()` and `symbol()` attach
 *      the mirror's real last close as `SymbolInfo.quote`; a ticker the
 *      ranking does not cover, or a snapshot that cannot be read, gets
 *      `quote: null` and renders as "—". The prototype's frozen prices
 *      survive only under `SymbolInfo.demo`, which no screen renders as
 *      *the* price.
 * The rest — day change, volume, market cap, P/E, RSI, portfolios, holdings,
 * news, the chart series — is still demonstration data; swap in a real
 * DataService implementation to take it live (see service.ts).
 *
 * Two switches, both in data/demoFlags.ts:
 *   'demoData'    → the reader's own "sample data" switch, in the More tab.
 *                   Charts draw a generated series and the earnings surfaces
 *                   render illustrative figures. The one sanctioned way for
 *                   invented numbers to stand in for real ones, because the
 *                   reader asked for it.
 *   'unavailable' → QA only: the demo-backed fetches report 'unavailable' on
 *                   purpose, from Settings → Data & display. It deliberately
 *                   does NOT apply to the live satellite call: faking states
 *                   on a live data source would defeat the point of it being
 *                   live.
 */

import type { DataService } from './service';
import { fetchQuotes, fetchSatelliteSignals } from './recoveryDetector';
import { fetchDailySeries } from './priceHistory';
import {
  ok,
  unavailable,
  type EarningsEvent,
  type Holding,
  type Loadable,
  type NewsItem,
  type PortfolioSummary,
  type Quote,
  type SymbolInfo,
  type WatchRow,
} from './types';
import { DEMO_FLAGS } from './demoFlags';

/**
 * The static half of a symbol — identity, sector, the beginner-mode copy and
 * the demo stats. The real half (`quote`) is attached at read time from the
 * mirror, so there is no price literal anywhere in this file for a failed
 * read to fall back to. That is the same discipline the deleted demo
 * satellite array got, for the same reason.
 */
type SymbolRow = Omit<SymbolInfo, 'quote'>;

// One row per record, read as a table. Prettier would explode each row into
// a dozen lines and the shape of the data would be lost, so this literal is
// left formatted by hand on purpose.
// prettier-ignore
const SYMS: SymbolRow[] = [
  { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', demo: { price: 182.44, changePct: 2.31, volume: '148.2M', marketCap: '4.45T', pe: 52.1, rsi: 61 }, plain: { en: 'Chips that power AI data centres', he: 'שבבים שמריצים מרכזי נתונים של AI' }, why: { en: 'Data-centre revenue guide above consensus', he: 'תחזית הכנסות ממרכזי נתונים מעל הקונצנזוס' } },
  { ticker: 'AAPL', name: 'Apple', sector: 'Technology', demo: { price: 226.79, changePct: 0.42, volume: '41.6M', marketCap: '3.36T', pe: 34.8, rsi: 55 }, plain: { en: 'iPhone, Mac and services', he: 'אייפון, מק ושירותים' }, why: { en: 'Analyst raised target on iPhone 17 cycle', he: 'אנליסט העלה מחיר יעד לקראת אייפון 17' } },
  { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', demo: { price: 508.12, changePct: -0.67, volume: '18.9M', marketCap: '3.78T', pe: 36.2, rsi: 48 }, plain: { en: 'Windows, Office and Azure cloud', he: 'ווינדוס, אופיס וענן Azure' }, why: { en: 'Azure capacity spending questioned', he: 'סימני שאלה על הוצאות התרחבות ב-Azure' } },
  { ticker: 'AMD', name: 'Advanced Micro', sector: 'Technology', demo: { price: 171.35, changePct: 4.86, volume: '62.4M', marketCap: '277B', pe: 88.4, rsi: 72 }, plain: { en: 'Rival chipmaker to NVIDIA', he: 'יצרנית שבבים מתחרה ל-NVIDIA' }, why: { en: 'New MI400 accelerator design win', he: 'זכייה בעיצוב למאיץ MI400 החדש' } },
  { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer', demo: { price: 334.62, changePct: -3.18, volume: '96.1M', marketCap: '1.08T', pe: 197.5, rsi: 38 }, plain: { en: 'Electric cars and energy storage', he: 'מכוניות חשמליות ואגירת אנרגיה' }, why: { en: 'European deliveries fell again in July', he: 'המסירות באירופה ירדו שוב ביולי' } },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', demo: { price: 291.04, changePct: 0.88, volume: '9.2M', marketCap: '812B', pe: 14.6, rsi: 58 }, plain: { en: 'The largest US bank', he: 'הבנק הגדול בארה״ב' }, why: { en: 'Net interest income outlook lifted', he: 'תחזית הכנסות מריבית עלתה' } },
  { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy', demo: { price: 112.47, changePct: -1.24, volume: '15.7M', marketCap: '486B', pe: 14.1, rsi: 44 }, plain: { en: 'Oil and natural gas', he: 'נפט וגז טבעי' }, why: { en: 'Crude slipped on demand data', he: 'הנפט ירד על נתוני ביקוש' } },
  { ticker: 'LLY', name: 'Eli Lilly', sector: 'Healthcare', demo: { price: 742.18, changePct: 1.96, volume: '3.4M', marketCap: '705B', pe: 61.9, rsi: 63 }, plain: { en: 'Weight-loss and diabetes drugs', he: 'תרופות להרזיה וסוכרת' }, why: { en: 'Phase 3 readout for oral GLP-1', he: 'תוצאות שלב 3 ל-GLP-1 בכמוסה' } },
  { ticker: 'TEVA', name: 'Teva Pharmaceutical', sector: 'Healthcare', demo: { price: 18.42, changePct: 1.21, volume: '12.4M', marketCap: '21B', pe: 9.8, rsi: 58 }, plain: { en: 'Generic medicines maker', he: 'יצרנית תרופות גנריות' }, why: { en: 'Generics pricing outlook improved', he: 'תחזית מחירי הגנריקה השתפרה' } },
  { ticker: 'MDA', name: 'MDA Space', sector: 'Industrials', demo: { price: 29.14, changePct: -1.42, volume: '2.1M', marketCap: '3.6B', pe: 31.2, rsi: 47 }, plain: { en: 'Satellites and space robotics', he: 'לוויינים ורובוטיקה לחלל' }, why: { en: 'Contract award timing slipped', he: 'לוחות הזמנים לזכייה בחוזה נדחו' } },
];

/* NOTE: the demo satellite-positions array that used to live here (MRNA/ALB/
 * TEVA/MDA, carried from the design prototype) has been deleted on purpose.
 * Satellite positions are now live (see recoveryDetector.ts) and there must be
 * no demo rows anywhere in reach of that code path to accidentally fall back
 * to. */

// One row per record, read as a table. Prettier would explode each row into
// a dozen lines and the shape of the data would be lost, so this literal is
// left formatted by hand on purpose.
// prettier-ignore
const PORTFOLIOS: PortfolioSummary[] = [
  { id: 'agg', kind: 'aggregate', name: 'All accounts', broker: null, logo: null, acct: '', syncedAgo: null, total: 82589.73, dayPct: 0.94, allTimePct: 26.8 },
  { id: 'blink', kind: 'linked', name: 'Blink', broker: 'Blink', logo: '/assets/broker-blink.webp', acct: '••4821', syncedAgo: { en: '4 minutes ago', he: 'לפני 4 דקות' }, total: 48214.6, dayPct: 0.86, allTimePct: 31.4 },
  { id: 'ibkr', kind: 'linked', name: 'Interactive Brokers', broker: 'Interactive Brokers', logo: '/assets/broker-ibkr.webp', acct: '••7130', syncedAgo: { en: '11 minutes ago', he: 'לפני 11 דקות' }, total: 12905.11, dayPct: 1.94, allTimePct: 58.2 },
  { id: 'colmex', kind: 'linked', name: 'Colmex Pro', broker: 'Colmex Pro', logo: '/assets/broker-colmex.webp', acct: '••2265', syncedAgo: { en: '1 hour ago', he: 'לפני שעה' }, total: 21470.02, dayPct: -0.22, allTimePct: 9.8 },
  { id: 'sandbox', kind: 'manual', name: 'Sandbox', broker: null, logo: null, acct: 'manual entry', syncedAgo: { en: 'you last edited it Aug 22', he: 'עדכנת לאחרונה ב-22 באוג׳' }, total: 9840.25, dayPct: 1.32, allTimePct: 12.9 },
];

const HOLDING_SHAPE: Array<[string, number, number]> = [
  ['NVDA', 14, 38.2],
  ['AAPL', 22, 12.4],
  ['MSFT', 9, 21.9],
  ['AMD', 31, 64.8],
  ['TSLA', 6, -8.1],
  ['JPM', 12, 5.6],
];

// Fields grouped by hand so each story reads as a few labelled lines rather
// than one per key.
// prettier-ignore
const NEWS: NewsItem[] = [
  {
    time: '09:42', source: 'Reuters', ticker: 'NVDA',
    headline: 'NVIDIA lifts data-centre outlook as Blackwell shipments accelerate',
    tag: 'Guidance', changePct: 2.31,
    summary: 'Management said supply, not demand, is the constraint into next quarter.',
    body: 'NVIDIA told investors that data-centre revenue is on track to beat prior guidance, as production of its Blackwell chips ramps faster than expected. Executives said the company remains supply-constrained rather than demand-constrained heading into next quarter, with order backlogs stretching into next year across cloud and enterprise customers.\n\nThe company said yield rates on the newest Blackwell packaging step have improved meaningfully over the last two months, easing one of the bottlenecks that slowed shipments earlier in the year. Cloud providers building out next-generation AI capacity were named as the primary source of incremental demand, with several large multi-quarter commitments already booked.\n\nManagement declined to give a specific unit number for the coming quarter but said capacity additions at partner foundries should let the company narrow the gap between orders and shipments over the next two quarters.',
  },
  {
    time: '09:31', source: 'Bloomberg', ticker: 'AMD',
    headline: 'AMD lands MI400 design win with a top-three cloud provider',
    tag: 'Product', changePct: 4.86,
    summary: 'The order is multi-year and starts shipping in the first half of next year.',
    body: 'AMD has secured a multi-year agreement to supply its upcoming MI400 accelerator to one of the three largest cloud providers, according to people familiar with the deal. Shipments are expected to begin in the first half of next year, once the chip clears final qualification testing.\n\nThe win is significant because it marks AMD\'s first large committed order for the MI400 generation ahead of its formal launch, suggesting the cloud provider is looking to diversify its AI-accelerator supply chain rather than rely on a single vendor. Financial terms of the agreement were not disclosed.\n\nAnalysts said the deal, if it scales as described, would meaningfully narrow the revenue gap between AMD\'s data-centre GPU business and the market leader over the next two years, though execution and yield on the new chip remain the key risks.',
  },
  {
    time: '09:18', source: 'WSJ', ticker: 'MSFT',
    headline: 'Microsoft trims Azure capacity plans for the next two quarters',
    tag: 'Capex', changePct: -0.67,
    summary: 'Spending moves out, not away — the buildout is being paced rather than cut.',
    body: 'Microsoft has told some data-centre construction partners that it is pushing back a portion of planned Azure capacity additions over the next two quarters, according to people briefed on the matter. The company characterized the move as a pacing adjustment tied to power and equipment delivery timelines, not a reduction in its overall buildout.\n\nProjects already under construction are continuing on schedule; the affected sites are newer ones that had not yet broken ground. Microsoft said long-term capital spending plans for AI infrastructure are unchanged, and that it continues to sign new leases for data-centre capacity in several regions.\n\nThe report comes as investors watch capex guidance closely across the large cloud providers for signs of either overbuilding or a slowdown in AI-driven demand.',
  },
  {
    time: '08:55', source: 'FT', ticker: 'TSLA',
    headline: 'Tesla delivery estimates cut across three brokerages',
    tag: 'Analyst', changePct: -3.18,
    summary: 'Europe volumes are the common thread in all three notes.',
    body: 'Three brokerages lowered their quarterly delivery estimates for Tesla on Thursday, each citing softer registration data out of Europe over the past two months. All three notes pointed to increased competition from domestic and Chinese electric-vehicle makers in the region as the main driver of the shortfall, rather than any single Tesla-specific issue.\n\nOne of the notes also flagged a slower-than-expected refresh cycle for the Model Y in some European markets as a contributing factor. North American and Chinese delivery trends were left largely unchanged in the same reports.\n\nTesla has not commented on the revised estimates. The company\'s own delivery figures for the quarter are due in the coming weeks.',
  },
  {
    time: '08:40', source: 'CNBC', ticker: 'LLY',
    headline: 'Lilly weight-loss pill filing accepted for priority review',
    tag: 'Regulatory', changePct: 1.42,
    summary: 'A decision is expected inside six months.',
    body: 'Eli Lilly said regulators have accepted its application for an oral weight-loss drug and granted it priority review, putting a decision inside a roughly six-month window instead of the standard longer timeline. The pill is seen as a potential complement to the company\'s existing injectable treatments, offering an option for patients who prefer not to use injections.\n\nLilly said the priority designation was based on clinical trial data showing weight-loss results comparable to its injectable products, along with a manageable side-effect profile. If approved, the company has said it plans a broad manufacturing scale-up given the scale of demand seen for its existing weight-loss treatments.\n\nAnalysts noted that an oral option, if approved, could meaningfully expand the addressable market by removing a barrier for patients hesitant about injections.',
  },
  {
    time: '08:12', source: 'Reuters', ticker: 'JPM',
    headline: 'JPMorgan flags softer loan demand but holds its outlook',
    tag: 'Guidance', changePct: 0.88,
    summary: 'Net interest income guidance was unchanged for the full year.',
    body: 'JPMorgan executives said commercial loan demand has softened slightly over the past quarter as businesses stay cautious on new borrowing, but the bank left its full-year net interest income guidance unchanged. Executives attributed the softer demand to businesses waiting for more clarity on interest rates rather than a broader pullback in economic activity.\n\nConsumer spending trends were described as resilient, with credit card balances and delinquency rates both tracking in line with the bank\'s prior expectations. Deposit trends were also described as stable.\n\nThe bank reiterated that it does not expect a meaningful change to its lending outlook unless broader economic conditions shift materially over the coming quarters.',
  },
  {
    time: '07:30', source: 'Reuters', ticker: 'AAPL',
    headline: 'Apple supplier orders point to a flat iPhone 17 build',
    tag: 'Supply chain', changePct: 0.42,
    summary: 'Two suppliers reported bookings in line with last cycle.',
    body: 'Two component suppliers in Apple\'s manufacturing chain reported order volumes for the current iPhone build that are roughly in line with the prior generation at the same point in the cycle, according to filings and comments made this week. That suggests Apple is planning for a build volume similar to last year\'s rather than a meaningful increase or decrease.\n\nThe suppliers, which produce display and camera-module components, did not comment directly on Apple\'s plans, but the order patterns are consistent with prior cycles where flat bookings preceded flat year-over-year unit shipments.\n\nApple does not comment on unreleased-product supply chain reports. Investors typically watch supplier order data as an early signal ahead of the company\'s official guidance.',
  },
];

// One row per record, read as a table. Prettier would explode each row into
// a dozen lines and the shape of the data would be lost, so this literal is
// left formatted by hand on purpose.
// prettier-ignore
const EARNINGS: EarningsEvent[] = [
  { date: 'Mon 25', when: 'AMC', ticker: 'LLY', name: 'Eli Lilly', mktCap: '742B', epsEst: '$1.52', revEst: '$12.9B', impliedMove: '±6.4%', lastSurprise: '+8.1%' },
  { date: 'Mon 25', when: 'BMO', ticker: 'XOM', name: 'Exxon Mobil', mktCap: '486B', epsEst: '$1.88', revEst: '$88.1B', impliedMove: '±3.1%', lastSurprise: '+2.4%' },
  { date: 'Tue 26', when: 'AMC', ticker: 'CRM', name: 'Salesforce', mktCap: '241B', epsEst: '$2.74', revEst: '$9.4B', impliedMove: '±7.8%', lastSurprise: '+4.9%' },
  { date: 'Tue 26', when: 'BMO', ticker: 'JPM', name: 'JPMorgan Chase', mktCap: '801B', epsEst: '$4.41', revEst: '$42.7B', impliedMove: '±2.6%', lastSurprise: '+3.2%' },
  { date: 'Wed 27', when: 'AMC', ticker: 'NVDA', name: 'NVIDIA', mktCap: '4.45T', epsEst: '$1.24', revEst: '$54.2B', impliedMove: '±8.9%', lastSurprise: '+11.4%' },
  { date: 'Wed 27', when: 'AMC', ticker: 'CRWD', name: 'CrowdStrike', mktCap: '92B', epsEst: '$0.96', revEst: '$1.2B', impliedMove: '±9.2%', lastSurprise: '-2.8%' },
  { date: 'Thu 28', when: 'AMC', ticker: 'AMD', name: 'Advanced Micro', mktCap: '277B', epsEst: '$1.14', revEst: '$8.9B', impliedMove: '±7.4%', lastSurprise: '+6.2%' },
  { date: 'Thu 28', when: 'BMO', ticker: 'BABA', name: 'Alibaba', mktCap: '214B', epsEst: '$2.09', revEst: '$34.1B', impliedMove: '±6.8%', lastSurprise: '+5.4%' },
  { date: 'Fri 29', when: 'BMO', ticker: 'MRVL', name: 'Marvell Technology', mktCap: '78B', epsEst: '$0.62', revEst: '$1.9B', impliedMove: '±9.8%', lastSurprise: '+3.9%' },
];

/** Wrap demo data in a Loadable, respecting the unavailable demo flag. */
async function respond<T>(data: T): Promise<Loadable<T>> {
  if (DEMO_FLAGS.unavailable) return unavailable();
  return ok(data);
}

/**
 * Attach the mirror's real numbers to a static symbol row.
 *
 * Null `quote` covers both honest misses at once — the snapshot could not be
 * read, or it was read fine and simply does not rank this ticker. Neither is
 * back-filled from `row.demo.price`: a fabricated price that looks live is
 * the exact failure this split exists to prevent, and the two cases read the
 * same on screen ("—") because in both the app genuinely does not know.
 */
function withQuote(row: SymbolRow, quotes: Loadable<Record<string, Quote>>): SymbolInfo {
  return { ...row, quote: quotes.status === 'ok' ? (quotes.data[row.ticker] ?? null) : null };
}

/**
 * Describe one ticker with everything actually known about it, and nothing
 * else. The sample table supplies a name, a sector and the demo day change
 * when it has a row; a symbol it does not cover keeps those null rather than
 * borrowing another company's.
 */
function watchRow(rawTicker: string, quotes: Loadable<Record<string, Quote>>): WatchRow {
  const ticker = rawTicker.trim().toUpperCase();
  const row = SYMS.find((x) => x.ticker === ticker);
  const quote = quotes.status === 'ok' ? (quotes.data[ticker] ?? null) : null;
  return {
    ticker,
    name: row?.name ?? null,
    sector: row?.sector ?? null,
    plain: row?.plain ?? null,
    quote,
    demoChangePct: row?.demo.changePct ?? null,
    ranked: quote !== null,
  };
}

/** Deterministic seeded pseudo-random walk — same math as the prototype charts. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export const demoService: DataService & { isDemo: true } = {
  isDemo: true,

  /**
   * The symbol list, with REAL prices attached.
   *
   * The one await left here is the mirror read: the simulated latency it used
   * to run alongside is gone. A failed or stale snapshot leaves every `quote`
   * null — the list of symbols is still perfectly good, and a watchlist that
   * renders its rows with "—" for the price tells the reader more than a
   * screen-wide "unavailable" would.
   */
  async symbols() {
    const quotes = await fetchQuotes();
    if (DEMO_FLAGS.unavailable) return unavailable();
    return ok(SYMS.map((row) => withQuote(row, quotes)));
  },

  async symbol(ticker: string) {
    const quotes = await fetchQuotes();
    if (DEMO_FLAGS.unavailable) return unavailable();
    const s = SYMS.find((x) => x.ticker === ticker);
    return s ? ok(withQuote(s, quotes)) : unavailable();
  },

  /**
   * The user's watchlist, in their order.
   *
   * The sample table is consulted for a name, a sector and the demo day
   * change, but it does not gate the row: a ticker it has never heard of is
   * still returned, described by its real quote alone. A watchlist that
   * silently dropped the symbols the sample table misses would be the demo
   * list wearing the user's name.
   *
   * An empty watchlist returns ok([]) without touching the mirror — a new
   * account should cost no request at all, and "you have not added anything"
   * is not a failure to report.
   */
  async watchRows(tickers: string[]) {
    if (tickers.length === 0) return ok<WatchRow[]>([]);
    const quotes = await fetchQuotes();
    if (DEMO_FLAGS.unavailable) return unavailable<WatchRow[]>();
    return ok(tickers.map((ticker) => watchRow(ticker, quotes)));
  },

  /**
   * The addressable universe: the sample table first (those rows carry a
   * company name, which is what someone typing "apple" is searching for),
   * then every other symbol the day's ranking covers, then anything in
   * `include` that neither had.
   *
   * `include` is the caller's watchlist. A ticker the ranking has since
   * dropped is still on the user's list, and search is where they go to take
   * it off — a list that quietly omits it cannot be used to do that, and
   * disagrees with `watchRows`, which keeps it.
   *
   * Dedupe is on the normalised ticker, not the raw mirror key. mapSignal
   * uppercases what the snapshot carries but does not trim it, so a key with
   * stray whitespace failed a raw comparison against the sample table while
   * watchRow normalised it to the same symbol — two rows for one company,
   * under one React key.
   *
   * A dead mirror leaves the sample table, which is still a usable — if
   * short — list to search, so this is only 'unavailable' under the demo
   * failure flag.
   */
  async searchUniverse(include: string[] = []) {
    const quotes = await fetchQuotes();
    if (DEMO_FLAGS.unavailable) return unavailable<WatchRow[]>();
    const rows: WatchRow[] = [];
    const seen = new Set<string>();
    const add = (raw: string) => {
      const row = watchRow(raw, quotes);
      if (seen.has(row.ticker)) return;
      seen.add(row.ticker);
      rows.push(row);
    };
    for (const row of SYMS) add(row.ticker);
    if (quotes.status === 'ok') for (const ticker of Object.keys(quotes.data)) add(ticker);
    for (const ticker of include) add(ticker);
    return ok(rows);
  },

  /**
   * REAL ENGINE DATA — the one method on this adapter that is not demo data.
   * No demo latency, no DEMO_FLAGS: it reads the daily mirror of the Recovery
   * Detector screener (a static file published by
   * .github/workflows/mirror-screener.yml, not a live call to Render) and
   * returns exactly what that read yields — ok(signals) | ok([]) for a real
   * empty result | unavailable on any failure, including a snapshot too old to
   * trust. There is deliberately no demo fallback path here.
   */
  async satelliteSignals() {
    return fetchSatelliteSignals();
  },

  /**
   * REAL, like satelliteSignals and for the same reasons: it reads the daily
   * price-history mirror and returns exactly what that read yields. No demo
   * latency, no DEMO_FLAGS, and above all no seeded-walk fallback — a chart
   * quietly backfilled with invented price action is indistinguishable from a
   * real one, which makes it the worst possible thing to fabricate.
   */
  async dailySeries(ticker: string) {
    return fetchDailySeries(ticker);
  },

  async portfolios() {
    return respond(PORTFOLIOS);
  },

  async holdings(portfolioId: string) {
    if (DEMO_FLAGS.unavailable) return unavailable();
    const holdings: Holding[] = HOLDING_SHAPE.map(([ticker, shares, plPct]) => {
      const sym = SYMS.find((x) => x.ticker === ticker)!;
      // Demo prices on purpose: the share counts and accounts above are
      // demo too, so valuing them at real prices would produce a portfolio
      // that is neither. Holdings go real when transactions do.
      return {
        ticker,
        shares,
        avgCost: sym.demo.price * 0.72,
        value: shares * sym.demo.price,
        plPct,
      };
    });
    // Institutions expose totals only, never holdings (product rule).
    return ok(
      portfolioId === 'agg' || PORTFOLIOS.some((pf) => pf.id === portfolioId && pf.kind !== 'institution')
        ? holdings
        : [],
    );
  },

  async news() {
    return respond(NEWS);
  },

  async earnings() {
    return respond(EARNINGS);
  },

  series(key: string, n: number, drift: number, vol: number): number[] {
    // Deterministic in its arguments, and called from render paths (chart
    // props, per-card sparklines), so each distinct walk is computed once.
    // Callers treat the array as read-only.
    const memoKey = `${key}|${n}|${drift}|${vol}`;
    const hit = seriesMemo.get(memoKey);
    if (hit) return hit;
    const seed = [...key].reduce((a, c) => a + c.charCodeAt(0) * 13, 5);
    const r = rng(seed);
    let v = 100;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      v += (r() - 0.47) * vol + drift;
      out.push(v);
    }
    seriesMemo.set(memoKey, out);
    return out;
  },
};

const seriesMemo = new Map<string, number[]>();
