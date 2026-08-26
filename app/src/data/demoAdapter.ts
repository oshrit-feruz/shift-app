/**
 * DEMO DATA ADAPTER — every number here is demonstration data carried over
 * from the design prototype. Nothing is live. The UI labels demo-backed
 * surfaces via the isDemo flag; swap in a real DataService implementation to
 * go live (see service.ts for the contract).
 *
 * Failure-mode switches (for demos and UI verification):
 *   localStorage['shift.demo.unavailable'] = '1'  → every fetch returns 'unavailable'
 *   localStorage['shift.demo.satEmpty']    = '1'  → satellite positions return ok([])
 * Both can also be toggled from Settings → Data & display in the app.
 */

import type { DataService } from './service';
import {
  ok,
  unavailable,
  type AnalystConsensus,
  type EarningsEvent,
  type Holding,
  type Loadable,
  type LongTermAccount,
  type NewsItem,
  type NextEarnings,
  type PortfolioMetrics,
  type PortfolioSummary,
  type SatellitePosition,
  type StockStats,
  type SymbolInfo,
} from './types';

export const DEMO_FLAGS = {
  key: { unavailable: 'shift.demo.unavailable', satEmpty: 'shift.demo.satEmpty' },
  get unavailable(): boolean {
    try {
      return localStorage.getItem(this.key.unavailable) === '1';
    } catch {
      return false;
    }
  },
  get satEmpty(): boolean {
    try {
      return localStorage.getItem(this.key.satEmpty) === '1';
    } catch {
      return false;
    }
  },
  set(key: 'unavailable' | 'satEmpty', on: boolean) {
    try {
      if (on) localStorage.setItem(this.key[key], '1');
      else localStorage.removeItem(this.key[key]);
    } catch {
      /* no storage — flags simply don't persist */
    }
  },
};

const SYMS: SymbolInfo[] = [
  { ticker: 'NVDA', name: 'NVIDIA', price: 182.44, changePct: 2.31, volume: '148.2M', marketCap: '4.45T', pe: 52.1, rsi: 61, sector: 'Technology', plain: { en: 'Chips that power AI data centres', he: 'שבבים שמריצים מרכזי נתונים של AI' }, why: { en: 'Data-centre revenue guide above consensus', he: 'תחזית הכנסות ממרכזי נתונים מעל הקונצנזוס' } , rvol: 2.3 },
  { ticker: 'AAPL', name: 'Apple', price: 226.79, changePct: 0.42, volume: '41.6M', marketCap: '3.36T', pe: 34.8, rsi: 55, sector: 'Technology', plain: { en: 'iPhone, Mac and services', he: 'אייפון, מק ושירותים' }, why: { en: 'Analyst raised target on iPhone 17 cycle', he: 'אנליסט העלה מחיר יעד לקראת אייפון 17' } , rvol: 0.9 },
  { ticker: 'MSFT', name: 'Microsoft', price: 508.12, changePct: -0.67, volume: '18.9M', marketCap: '3.78T', pe: 36.2, rsi: 48, sector: 'Technology', plain: { en: 'Windows, Office and Azure cloud', he: 'ווינדוס, אופיס וענן Azure' }, why: { en: 'Azure capacity spending questioned', he: 'סימני שאלה על הוצאות התרחבות ב-Azure' } , rvol: 0.8 },
  { ticker: 'AMD', name: 'Advanced Micro', price: 171.35, changePct: 4.86, volume: '62.4M', marketCap: '277B', pe: 88.4, rsi: 72, sector: 'Technology', plain: { en: 'Rival chipmaker to NVIDIA', he: 'יצרנית שבבים מתחרה ל-NVIDIA' }, why: { en: 'New MI400 accelerator design win', he: 'זכייה בעיצוב למאיץ MI400 החדש' } , rvol: 3.1 },
  { ticker: 'TSLA', name: 'Tesla', price: 334.62, changePct: -3.18, volume: '96.1M', marketCap: '1.08T', pe: 197.5, rsi: 38, sector: 'Consumer', plain: { en: 'Electric cars and energy storage', he: 'מכוניות חשמליות ואגירת אנרגיה' }, why: { en: 'European deliveries fell again in July', he: 'המסירות באירופה ירדו שוב ביולי' } , rvol: 1.8 },
  { ticker: 'JPM', name: 'JPMorgan Chase', price: 291.04, changePct: 0.88, volume: '9.2M', marketCap: '812B', pe: 14.6, rsi: 58, sector: 'Financials', plain: { en: 'The largest US bank', he: 'הבנק הגדול בארה״ב' }, why: { en: 'Net interest income outlook lifted', he: 'תחזית הכנסות מריבית עלתה' } , rvol: 0.7 },
  { ticker: 'XOM', name: 'Exxon Mobil', price: 112.47, changePct: -1.24, volume: '15.7M', marketCap: '486B', pe: 14.1, rsi: 44, sector: 'Energy', plain: { en: 'Oil and natural gas', he: 'נפט וגז טבעי' }, why: { en: 'Crude slipped on demand data', he: 'הנפט ירד על נתוני ביקוש' } , rvol: 1.1 },
  { ticker: 'LLY', name: 'Eli Lilly', price: 742.18, changePct: 1.96, volume: '3.4M', marketCap: '705B', pe: 61.9, rsi: 63, sector: 'Healthcare', plain: { en: 'Weight-loss and diabetes drugs', he: 'תרופות להרזיה וסוכרת' }, why: { en: 'Phase 3 readout for oral GLP-1', he: 'תוצאות שלב 3 ל-GLP-1 בכמוסה' } , rvol: 1.4 },
  { ticker: 'TEVA', name: 'Teva Pharmaceutical', price: 18.42, changePct: 1.21, volume: '12.4M', marketCap: '21B', pe: 9.8, rsi: 58, sector: 'Healthcare', plain: { en: 'Generic medicines maker', he: 'יצרנית תרופות גנריות' }, why: { en: 'Generics pricing outlook improved', he: 'תחזית מחירי הגנריקה השתפרה' } , rvol: 1.2 },
  { ticker: 'MDA', name: 'MDA Space', price: 29.14, changePct: -1.42, volume: '2.1M', marketCap: '3.6B', pe: 31.2, rsi: 47, sector: 'Industrials', plain: { en: 'Satellites and space robotics', he: 'לוויינים ורובוטיקה לחלל' }, why: { en: 'Contract award timing slipped', he: 'לוחות הזמנים לזכייה בחוזה נדחו' } , rvol: 0.6 },
];

/** Recovery Detector open positions (demo). MRNA/ALB carried from prototype. */
const SAT: SatellitePosition[] = [
  { ticker: 'MRNA', entryPrice: 24.8, currentPrice: 31.15 },
  { ticker: 'ALB', entryPrice: 62.4, currentPrice: 71.05 },
  { ticker: 'TEVA', entryPrice: 14.9, currentPrice: 18.42 },
  { ticker: 'MDA', entryPrice: 31.2, currentPrice: 29.14 },
];

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
  { date: 'Mon 25', when: 'AMC', ticker: 'LLY', name: 'Eli Lilly', epsEst: '$1.52', impliedMove: '±6.4%' },
  { date: 'Mon 25', when: 'BMO', ticker: 'XOM', name: 'Exxon Mobil', epsEst: '$1.88', impliedMove: '±3.1%' },
  { date: 'Tue 26', when: 'AMC', ticker: 'CRM', name: 'Salesforce', epsEst: '$2.74', impliedMove: '±7.8%' },
  { date: 'Tue 26', when: 'BMO', ticker: 'JPM', name: 'JPMorgan Chase', epsEst: '$4.41', impliedMove: '±2.6%' },
  { date: 'Wed 27', when: 'AMC', ticker: 'NVDA', name: 'NVIDIA', epsEst: '$1.24', impliedMove: '±8.9%' },
  { date: 'Wed 27', when: 'AMC', ticker: 'CRWD', name: 'CrowdStrike', epsEst: '$0.96', impliedMove: '±9.2%' },
  { date: 'Thu 28', when: 'AMC', ticker: 'AMD', name: 'Advanced Micro', epsEst: '$1.14', impliedMove: '±7.4%' },
  { date: 'Thu 28', when: 'BMO', ticker: 'BABA', name: 'Alibaba', epsEst: '$2.09', impliedMove: '±6.8%' },
  { date: 'Fri 29', when: 'BMO', ticker: 'MRVL', name: 'Marvell Technology', epsEst: '$0.62', impliedMove: '±9.8%' },
];

/** Per-ticker demo stats — explicitly authored, distinct per ticker. */
const AH = (price: number) => ({ price, asOf: { en: 'Aug 25, 5:52 PM ET', he: '25 באוג׳, 17:52 ET' } });
const STATS: Record<string, StockStats> = {
  NVDA: { open: 179.1, high: 184.9, low: 178.3, prevClose: 178.32, low52: 86.62, high52: 184.48, avgVol: '162.4M', beta: 2.14, divYield: '0.02%', shortFloat: '1.1%', fwdPe: 32.4, afterHours: AH(183.1) },
  AAPL: { open: 225.4, high: 228.1, low: 224.6, prevClose: 225.84, low52: 168.8, high52: 237.49, avgVol: '48.2M', beta: 1.21, divYield: '0.44%', shortFloat: '0.8%', fwdPe: 29.6, afterHours: AH(226.4) },
  MSFT: { open: 511.2, high: 512.8, low: 505.9, prevClose: 511.55, low52: 385.6, high52: 555.45, avgVol: '21.3M', beta: 0.92, divYield: '0.66%', shortFloat: '0.6%', fwdPe: 31.1, afterHours: null },
  AMD: { open: 164.5, high: 172.6, low: 163.9, prevClose: 163.41, low52: 93.12, high52: 227.3, avgVol: '54.8M', beta: 1.94, divYield: '—', shortFloat: '2.4%', fwdPe: 41.2, afterHours: AH(170.8) },
  TSLA: { open: 344.8, high: 346.2, low: 332.1, prevClose: 345.6, low52: 212.11, high52: 488.54, avgVol: '88.7M', beta: 2.31, divYield: '—', shortFloat: '2.9%', fwdPe: 112.4, afterHours: AH(333.9) },
  JPM: { open: 288.9, high: 291.8, low: 288.2, prevClose: 288.5, low52: 190.9, high52: 296.4, avgVol: '8.8M', beta: 1.05, divYield: '1.92%', shortFloat: '0.9%', fwdPe: 13.8, afterHours: null },
  XOM: { open: 113.9, high: 114.2, low: 112.1, prevClose: 113.88, low52: 97.8, high52: 126.34, avgVol: '14.9M', beta: 0.88, divYield: '3.42%', shortFloat: '1.6%', fwdPe: 13.2, afterHours: null },
  LLY: { open: 729.5, high: 744.9, low: 728.8, prevClose: 727.9, low52: 677.1, high52: 972.53, avgVol: '3.1M', beta: 0.41, divYield: '0.81%', shortFloat: '1.0%', fwdPe: 34.7, afterHours: AH(743.6) },
  TEVA: { open: 18.2, high: 18.6, low: 18.1, prevClose: 18.2, low52: 12.47, high52: 22.8, avgVol: '10.9M', beta: 1.12, divYield: '—', shortFloat: '2.1%', fwdPe: 7.2, afterHours: null },
  MDA: { open: 29.6, high: 29.8, low: 28.9, prevClose: 29.56, low52: 18.4, high52: 36.9, avgVol: '1.8M', beta: 1.35, divYield: '—', shortFloat: '3.2%', fwdPe: 24.8, afterHours: null },
};

const CONSENSUS: Record<string, AnalystConsensus> = {
  NVDA: { strongBuy: 31, buy: 11, hold: 8, sell: 3 },
  AAPL: { strongBuy: 18, buy: 14, hold: 12, sell: 2 },
  MSFT: { strongBuy: 34, buy: 12, hold: 4, sell: 1 },
  AMD: { strongBuy: 22, buy: 13, hold: 9, sell: 2 },
  TSLA: { strongBuy: 9, buy: 8, hold: 17, sell: 10 },
  JPM: { strongBuy: 12, buy: 9, hold: 8, sell: 1 },
  XOM: { strongBuy: 8, buy: 10, hold: 11, sell: 2 },
  LLY: { strongBuy: 19, buy: 8, hold: 5, sell: 1 },
  TEVA: { strongBuy: 5, buy: 7, hold: 9, sell: 2 },
  MDA: { strongBuy: 4, buy: 5, hold: 3, sell: 0 },
};

const NEXT_EARNINGS: Record<string, NextEarnings> = {
  NVDA: { month: { en: 'Nov', he: 'נוב׳' }, day: '18', beg: { en: 'Q3 results, after the close. The last four reports beat expectations.', he: 'תוצאות רבעון 3, אחרי הנעילה. ארבעת הדוחות האחרונים היכו את התחזיות.' }, adv: 'Q3 · Nov 18 AMC · est EPS 1.24 vs 0.68 y/y · 4/4 beats' },
  AMD: { month: { en: 'Oct', he: 'אוק׳' }, day: '28', beg: { en: 'Q3 results, after the close.', he: 'תוצאות רבעון 3, אחרי הנעילה.' }, adv: 'Q3 · Oct 28 AMC · est EPS 1.14' },
  AAPL: { month: { en: 'Oct', he: 'אוק׳' }, day: '30', beg: { en: 'Q4 results, after the close.', he: 'תוצאות רבעון 4, אחרי הנעילה.' }, adv: 'Q4 · Oct 30 AMC · est EPS 1.71' },
  MSFT: { month: { en: 'Oct', he: 'אוק׳' }, day: '24', beg: { en: 'Q1 results, after the close.', he: 'תוצאות רבעון 1, אחרי הנעילה.' }, adv: 'Q1 · Oct 24 AMC · est EPS 3.42' },
  LLY: { month: { en: 'Oct', he: 'אוק׳' }, day: '26', beg: { en: 'Q3 results, before the open.', he: 'תוצאות רבעון 3, לפני הפתיחה.' }, adv: 'Q3 · Oct 26 BMO · est EPS 1.52' },
  JPM: { month: { en: 'Oct', he: 'אוק׳' }, day: '14', beg: { en: 'Q3 results, before the open.', he: 'תוצאות רבעון 3, לפני הפתיחה.' }, adv: 'Q3 · Oct 14 BMO · est EPS 4.41' },
};

/** Long-term savings demo totals by kind (totals only — never holdings). */
const LONG_TERM: Record<'pension' | 'hisht' | 'bank', LongTermAccount & { syncedNote: { en: string; he: string } }> = {
  pension: { key: 'pension', total: 86340, ytdPct: 6.2, syncedNote: { en: 'synced 12 min ago', he: 'סונכרן לפני 12 דקות' } },
  hisht: { key: 'hisht', total: 31120, ytdPct: 5.4, syncedNote: { en: 'synced 26 min ago', he: 'סונכרן לפני 26 דקות' } },
  bank: { key: 'bank', total: 7860, ytdPct: null, syncedNote: { en: 'synced 1 hour ago', he: 'סונכרן לפני שעה' } },
};

const METRICS: PortfolioMetrics = {
  total: 48214,
  dayPct: 0.86,
  openPl: 11500,
  beta: 1.34,
  cashPct: 14,
  risk: { en: 'High', he: 'גבוה' },
};

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

  async satellitePositions() {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    // Honest empty state: an empty list is a real, valid answer.
    return ok(DEMO_FLAGS.satEmpty ? [] : SAT);
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

  async stockNews(ticker: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    // Only stories genuinely about this ticker — an empty list is the honest answer.
    return ok(NEWS.filter((n) => n.ticker === ticker));
  },

  async stockStats(ticker: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    const st = STATS[ticker];
    return st ? ok(st) : unavailable();
  },

  async analystConsensus(ticker: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    const c = CONSENSUS[ticker];
    return c ? ok(c) : unavailable();
  },

  async nextEarnings(ticker: string) {
    await wait();
    if (DEMO_FLAGS.unavailable) return unavailable();
    return ok(NEXT_EARNINGS[ticker] ?? null);
  },

  async portfolioMetrics() {
    return respond(METRICS);
  },

  async longTermAccounts() {
    return respond(Object.values(LONG_TERM));
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
