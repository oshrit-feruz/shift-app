/**
 * Illustrative earnings data for showcase mode.
 *
 * WHY THIS EXISTS. The free data plan the app runs on carries only reports
 * that have not happened yet, so the calendar can show who is due to report
 * and never what they reported. A paid plan carries both. Showcase mode
 * renders what those screens look like with the fuller data, so the
 * difference can be shown to someone before the money is spent.
 *
 * WHY IT IS NOT A LIE. Every screen that renders these rows says, on screen,
 * that they are illustrative — and the mode is off unless someone turns it
 * on in Settings. This app's contract is that invented figures never pass as
 * real; a demo the reader cannot identify would be precisely that. Nothing
 * here is ever used as a fallback when live data fails: an outage stays an
 * outage.
 *
 * The figures are deterministic — derived from the ticker and the date — so
 * the same screen shows the same numbers on every render and between
 * reloads. A demo whose figures flicker looks broken rather than illustrative.
 */

import { isoDay, WINDOW_DAYS, type EarningsPage } from './earnings';
import type { EarningsRow } from './types';

/** Companies the illustrative week is built from, with plausible consensus. */
const COMPANIES: Array<{ ticker: string; estimate: number }> = [
  { ticker: 'NVDA', estimate: 1.24 },
  { ticker: 'AAPL', estimate: 1.61 },
  { ticker: 'MSFT', estimate: 3.42 },
  { ticker: 'AMD', estimate: 1.14 },
  { ticker: 'TSLA', estimate: 0.72 },
  { ticker: 'JPM', estimate: 4.41 },
  { ticker: 'XOM', estimate: 1.88 },
  { ticker: 'LLY', estimate: 1.52 },
  { ticker: 'CRM', estimate: 2.74 },
  { ticker: 'CRWD', estimate: 0.96 },
  { ticker: 'BABA', estimate: 2.09 },
  { ticker: 'MRVL', estimate: 0.62 },
  { ticker: 'TEVA', estimate: 0.68 },
  { ticker: 'NKE', estimate: 0.79 },
];

/**
 * A stable number in [0, 1) from a string — the same inputs always give the
 * same figure, so the demo does not reshuffle itself between renders.
 */
function seeded(key: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Generate a deterministic surprise percentage from a string key, ranging roughly [-8, +12] and leaning positive as real earnings surprises do. */
function surpriseFor(key: string): number {
  return Math.round((seeded(key) * 20 - 8) * 10) / 10;
}

/**
 * The weekdays of the window the live calendar asks for, in UTC: this week's
 * Monday and the thirteen days after it, with Saturdays and Sundays dropped.
 *
 * Kept in step with `weekAheadWindow` on purpose. A demo that spans a
 * different stretch of dates than the live screen is not showing what the
 * live screen would look like with better data, which is the only thing it
 * is for.
 */
function windowWeekdays(now: Date): Date[] {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(monday.getTime() + i * 86_400_000)).filter(
    (day) => day.getUTCDay() !== 0 && day.getUTCDay() !== 6,
  );
}

/**
 * An illustrative fortnight: the same two-week window the live calendar asks
 * for, with the days that have already passed carrying reported results and
 * the days ahead carrying estimates.
 *
 * The days behind you are the whole point. The free plan's market-wide feed
 * carries only reports that have not happened yet, so on the live path those
 * days are empty; filling them is exactly the difference a paid plan buys,
 * and the difference is what this mode exists to show.
 */
export function showcaseWeek(now: Date = new Date()): EarningsPage {
  const days = windowWeekdays(now);
  const today = isoDay(now);
  const rows: EarningsRow[] = COMPANIES.map((c, i) => {
    const day = days[i % days.length];
    const reportDate = isoDay(day);
    const reported = reportDate < today;
    const surprisePct = reported ? surpriseFor(`${c.ticker}${reportDate}`) : null;
    return {
      ticker: c.ticker,
      reportDate,
      periodEnd: isoDay(new Date(day.getTime() - 30 * 86_400_000)),
      timing: (i % 3 === 0 ? 'BMO' : 'AMC') as EarningsRow['timing'],
      actual: surprisePct === null ? null : Math.round(c.estimate * (1 + surprisePct / 100) * 100) / 100,
      estimate: c.estimate,
      surprisePct,
    };
  }).sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  return { rows, truncated: false, totalAvailable: rows.length };
}

/** Quarters of history the showcase renders — the same depth the live path asks for. */
const SHOWCASE_QUARTERS = 12;

/**
 * An illustrative quarterly history for one ticker: twelve reported quarters
 * back, each with a consensus and a result, plus the next one scheduled.
 */
export function showcaseHistory(ticker: string, now: Date = new Date()): EarningsPage {
  const clean = ticker.trim().toUpperCase();
  const base = COMPANIES.find((c) => c.ticker === clean)?.estimate ?? 1 + seeded(clean) * 2;
  const rows: EarningsRow[] = [];

  for (let q = SHOWCASE_QUARTERS; q >= 1; q--) {
    const day = new Date(now.getTime() - q * 91 * 86_400_000);
    const reportDate = isoDay(day);
    const surprisePct = surpriseFor(`${clean}${reportDate}`);
    // Estimates drift upward over time, the way a growing company's do.
    const estimate = Math.round(base * (1 - q * 0.04) * 100) / 100;
    rows.push({
      ticker: clean,
      reportDate,
      periodEnd: isoDay(new Date(day.getTime() - 25 * 86_400_000)),
      timing: (q % 2 === 0 ? 'AMC' : 'BMO') as EarningsRow['timing'],
      actual: Math.round(estimate * (1 + surprisePct / 100) * 100) / 100,
      estimate,
      surprisePct,
    });
  }

  // The scheduled quarter: an estimate and no result, exactly as a real
  // upcoming report arrives.
  const next = new Date(now.getTime() + 14 * 86_400_000);
  rows.push({
    ticker: clean,
    reportDate: isoDay(next),
    periodEnd: isoDay(new Date(next.getTime() - 25 * 86_400_000)),
    timing: 'AMC',
    actual: null,
    estimate: Math.round(base * 1.04 * 100) / 100,
    surprisePct: null,
  });

  return { rows, truncated: false, totalAvailable: rows.length };
}
