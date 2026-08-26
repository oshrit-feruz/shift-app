/**
 * DEMO DATA ADAPTER — every number here is demonstration data carried over
 * from the design prototype.
 *
 * ONE EXCEPTION: `satellitePositions()` is LIVE. It delegates to
 * data/recoveryDetector.ts, which calls the real Recovery Detector API. That
 * method never returns demo data — not on failure, not on an empty result.
 * Everything else on this adapter is still demonstration data; swap in a real
 * DataService implementation to take the rest live (see service.ts).
 *
 * Failure-mode switch (for demos and UI verification of the demo-backed
 * surfaces only):
 *   localStorage['shift.demo.unavailable'] = '1'  → demo fetches return 'unavailable'
 * Toggleable from Settings → Data & display. It deliberately does NOT apply to
 * the live satellite call: faking states on a live data source would defeat
 * the point of it being live.
 */

import type { DataService } from './service';
import { fetchSatelliteSignals } from './recoveryDetector';
import {
  ok,
  unavailable,
  type EarningsEvent,
  type Holding,
  type Loadable,
  type NewsItem,
  type PortfolioSummary,
  type SymbolInfo,
} from './types';

export const DEMO_FLAGS = {
  key: { unavailable: 'shift.demo.unavailable' },
  get unavailable(): boolean {
    try {
      return localStorage.getItem(this.key.unavailable) === '1';
    } catch {
      return false;
    }
  },
  set(key: 'unavailable', on: boolean) {
    try {
      if (on) localStorage.setItem(this.key[key], '1');
      else localStorage.removeItem(this.key[key]);
    } catch {
      /* no storage — flags simply don't persist */
    }
  },
};

const SYMS: SymbolInfo[] = [
  { ticker: 'NVDA', name: 'NVIDIA', price: 182.44, changePct: 2.31, volume: '148.2M', marketCap: '4.45T', pe: 52.1, rsi: 61, sector: 'Technology', plain: { en: 'Chips that power AI data centres', he: 'שבבים שמריצים מרכזי נתונים של AI' }, why: { en: 'Data-centre revenue guide above consensus', he: 'תחזית הכנסות ממרכזי נתונים מעל הקונצנזוס' } },
  { ticker: 'AAPL', name: 'Apple', price: 226.79, changePct: 0.42, volume: '41.6M', marketCap: '3.36T', pe: 34.8, rsi: 55, sector: 'Technology', plain: { en: 'iPhone, Mac and services', he: 'אייפון, מק ושירותים' }, why: { en: 'Analyst raised target on iPhone 17 cycle', he: 'אנליסט העלה מחיר יעד לקראת אייפון 17' } },
  { ticker: 'MSFT', name: 'Microsoft', price: 508.12, changePct: -0.67, volume: '18.9M', marketCap: '3.78T', pe: 36.2, rsi: 48, sector: 'Technology', plain: { en: 'Windows, Office and Azure cloud', he: 'ווינדוס, אופיס וענן Azure' }, why: { en: 'Azure capacity spending questioned', he: 'סימני שאלה על הוצאות התרחבות ב-Azure' } },
  { ticker: 'AMD', name: 'Advanced Micro', price: 171.35, changePct: 4.86, volume: '62.4M', marketCap: '277B', pe: 88.4, rsi: 72, sector: 'Technology', plain: { en: 'Rival chipmaker to NVIDIA', he: 'יצרנית שבבים מתחרה ל-NVIDIA' }, why: { en: 'New MI400 accelerator design win', he: 'זכייה בעיצוב למאיץ MI400 החדש' } },
  { ticker: 'TSLA', name: 'Tesla', price: 334.62, changePct: -3.18, volume: '96.1M', marketCap: '1.08T', pe: 197.5, rsi: 38, sector: 'Consumer', plain: { en: 'Electric cars and energy storage', he: 'מכוניות חשמליות ואגירת אנרגיה' }, why: { en: 'European deliveries fell again in July', he: 'המסירות באירופה ירדו שוב ביולי' } },
  { ticker: 'JPM', name: 'JPMorgan Chase', price: 291.04, changePct: 0.88, volume: '9.2M', marketCap: '812B', pe: 14.6, rsi: 58, sector: 'Financials', plain: { en: 'The largest US bank', he: 'הבנק הגדול בארה״ב' }, why: { en: 'Net interest income outlook lifted', he: 'תחזית הכנסות מריבית עלתה' } },
  { ticker: 'XOM', name: 'Exxon Mobil', price: 112.47, changePct: -1.24, volume: '15.7M', marketCap: '486B', pe: 14.1, rsi: 44, sector: 'Energy', plain: { en: 'Oil and natural gas', he: 'נפט וגז טבעי' }, why: { en: 'Crude slipped on demand data', he: 'הנפט ירד על נתוני ביקוש' } },
  { ticker: 'LLY', name: 'Eli Lilly', price: 742.18, changePct: 1.96, volume: '3.4M', marketCap: '705B', pe: 61.9, rsi: 63, sector: 'Healthcare', plain: { en: 'Weight-loss and diabetes drugs', he: 'תרופות להרזיה וסוכרת' }, why: { en: 'Phase 3 readout for oral GLP-1', he: 'תוצאות שלב 3 ל-GLP-1 בכמוסה' } },
  { ticker: 'TEVA', name: 'Teva Pharmaceutical', price: 18.42, changePct: 1.21, volume: '12.4M', marketCap: '21B', pe: 9.8, rsi: 58, sector: 'Healthcare', plain: { en: 'Generic medicines maker', he: 'יצרנית תרופות גנריות' }, why: { en: 'Generics pricing outlook improved', he: 'תחזית מחירי הגנריקה השתפרה' } },
  { ticker: 'MDA', name: 'MDA Space', price: 29.14, changePct: -1.42, volume: '2.1M', marketCap: '3.6B', pe: 31.2, rsi: 47, sector: 'Industrials', plain: { en: 'Satellites and space robotics', he: 'לוויינים ורובוטיקה לחלל' }, why: { en: 'Contract award timing slipped', he: 'לוחות הזמנים לזכייה בחוזה נדחו' } },
];

/* NOTE: the demo satellite-positions array that used to live here (MRNA/ALB/
 * TEVA/MDA, carried from the design prototype) has been deleted on purpose.
 * Satellite positions are now live (see recoveryDetector.ts) and there must be
 * no demo rows anywhere in reach of that code path to accidentally fall back
 * to. */

const PORTFOLIOS: PortfolioSummary[] = [
  { id: 'agg', kind: 'aggregate', name: 'All accounts', broker: null, logo: null, acct: '', syncedAgo: null, total: 82589.73, dayPct: 0.94, allTimePct: 26.8 },
  { id: 'blink', kind: 'linked', name: 'Blink', broker: 'Blink', logo: '/assets/broker-blink.webp', acct: '••4821', syncedAgo: { en: '4 minutes ago', he: 'לפני 4 דקות' }, total: 48214.6, dayPct: 0.86, allTimePct: 31.4 },
  { id: 'ibkr', kind: 'linked', name: 'Interactive Brokers', broker: 'Interactive Brokers', logo: '/assets/broker-ibkr.png', acct: '••7130', syncedAgo: { en: '11 minutes ago', he: 'לפני 11 דקות' }, total: 12905.11, dayPct: 1.94, allTimePct: 58.2 },
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

const NEWS: NewsItem[] = [
  { time: '09:42', source: 'Reuters', ticker: 'NVDA', headline: 'NVIDIA lifts data-centre outlook as Blackwell shipments accelerate', tag: 'Guidance', changePct: 2.31, summary: 'Management said supply, not demand, is the constraint into next quarter.' },
  { time: '09:31', source: 'Bloomberg', ticker: 'AMD', headline: 'AMD lands MI400 design win with a top-three cloud provider', tag: 'Product', changePct: 4.86, summary: 'The order is multi-year and starts shipping in the first half of next year.' },
  { time: '09:18', source: 'WSJ', ticker: 'MSFT', headline: 'Microsoft trims Azure capacity plans for the next two quarters', tag: 'Capex', changePct: -0.67, summary: 'Spending moves out, not away — the buildout is being paced rather than cut.' },
  { time: '08:55', source: 'FT', ticker: 'TSLA', headline: 'Tesla delivery estimates cut across three brokerages', tag: 'Analyst', changePct: -3.18, summary: 'Europe volumes are the common thread in all three notes.' },
  { time: '08:40', source: 'CNBC', ticker: 'LLY', headline: 'Lilly weight-loss pill filing accepted for priority review', tag: 'Regulatory', changePct: 1.42, summary: 'A decision is expected inside six months.' },
  { time: '08:12', source: 'Reuters', ticker: 'JPM', headline: 'JPMorgan flags softer loan demand but holds its outlook', tag: 'Guidance', changePct: 0.88, summary: 'Net interest income guidance was unchanged for the full year.' },
  { time: '07:30', source: 'Reuters', ticker: 'AAPL', headline: 'Apple supplier orders point to a flat iPhone 17 build', tag: 'Supply chain', changePct: 0.42, summary: 'Two suppliers reported bookings in line with last cycle.' },
];

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

const LATENCY_MS = 250;
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

async function respond<T>(data: T): Promise<Loadable<T>> {
  await wait();
  if (DEMO_FLAGS.unavailable) return unavailable();
  return ok(data);
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

  async symbols() {
    return respond(SYMS);
  },

  async symbol(ticker: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    const s = SYMS.find((x) => x.ticker === ticker);
    return s ? ok(s) : unavailable();
  },

  /**
   * LIVE — the one method on this adapter that is not demo data.
   * No demo latency, no DEMO_FLAGS: it hits the real Recovery Detector API and
   * returns exactly what that call yields (ok(signals) | ok([]) for a real
   * empty result | unavailable on any failure). There is deliberately no demo
   * fallback path here.
   */
  async satelliteSignals() {
    return fetchSatelliteSignals();
  },

  async portfolios() {
    return respond(PORTFOLIOS);
  },

  async holdings(portfolioId: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    const holdings: Holding[] = HOLDING_SHAPE.map(([ticker, shares, plPct]) => {
      const sym = SYMS.find((x) => x.ticker === ticker)!;
      return { ticker, shares, avgCost: sym.price * 0.72, value: shares * sym.price, plPct };
    });
    // Institutions expose totals only, never holdings (product rule).
    return ok(portfolioId === 'agg' || PORTFOLIOS.some((pf) => pf.id === portfolioId && pf.kind !== 'institution') ? holdings : []);
  },

  async news() {
    return respond(NEWS);
  },

  async earnings() {
    return respond(EARNINGS);
  },

  series(key: string, n: number, drift: number, vol: number): number[] {
    const seed = [...key].reduce((a, c) => a + c.charCodeAt(0) * 13, 5);
    const r = rng(seed);
    let v = 100;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      v += (r() - 0.47) * vol + drift;
      out.push(v);
    }
    return out;
  },
};
