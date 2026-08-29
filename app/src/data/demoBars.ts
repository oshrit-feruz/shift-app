/**
 * Generated daily sessions, for demo mode only.
 *
 * This is the one place in the app that manufactures price action, and it
 * exists solely to serve the reader's own "sample data" switch (see
 * data/demoFlags.ts). Nothing calls it as a fallback: with the switch off, a
 * chart that cannot be drawn says so instead of drawing this.
 *
 * The walk is seeded from the ticker, so a symbol looks the same on every
 * render and across reloads — a demo whose chart reshuffles itself on each
 * paint reads as broken rather than illustrative.
 */

import type { Bar } from './types';

/** Sessions generated — a year of trading, the longest window the UI asks for. */
const SESSIONS = 260;

/** A stable number in [0, 1) from a string. */
function seeded(key: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Deterministic sequence from a numeric seed. */
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** YYYY-MM-DD in UTC, matching the mirror's date format. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `SESSIONS` weekday bars ending today, for one ticker.
 *
 * Weekends are skipped so the dates read like a real trading calendar; market
 * holidays are not modelled, which is the sort of detail a sample series can
 * afford to miss.
 */
export function demoBars(ticker: string, now: Date = new Date()): Bar[] {
  const clean = ticker.trim().toUpperCase();
  const r = rng(Math.floor(seeded(clean) * 2_147_483_647));
  // A per-ticker starting price, so two symbols are not the same chart with a
  // different label on it.
  let close = 40 + seeded(`${clean}-base`) * 260;
  // A gentle per-ticker trend, up for most symbols and down for some.
  const drift = (seeded(`${clean}-drift`) - 0.42) * 0.22;

  const bars: Bar[] = [];
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Walk backwards over weekdays, collecting the dates, then fill forwards so
  // the price series runs in the same direction as the calendar.
  const dates: string[] = [];
  const cursor = new Date(day.getTime());
  while (dates.length < SESSIONS) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(isoDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  dates.reverse();

  for (const date of dates) {
    const open = close;
    // Volatility scales with price, the way a real quote's daily range does.
    const range = open * (0.006 + r() * 0.022);
    close = Math.max(1, open + (r() - 0.5) * range * 2 + drift);
    const high = Math.max(open, close) + r() * range * 0.5;
    const low = Math.min(open, close) - r() * range * 0.5;
    bars.push({
      date,
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(0.5, low)),
      close: round2(close),
      volume: Math.round(1_000_000 + r() * 40_000_000),
    });
  }
  return bars;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
