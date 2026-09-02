/**
 * One bar of a price series, read back from this app's own route.
 *
 * The daily reader (priceHistory.ts) and the intraday one (intraday.ts) take
 * the same row shape and owe the same invariants; only the stamp differs — a
 * calendar day for one, a full UTC instant for the other. Having the checks
 * once is the point rather than the brevity: these ARE the promise the chart
 * makes about what it draws, and two copies of a promise are two chances for
 * one of them to quietly stop keeping it.
 *
 * The routes already enforce all of this, so a row failing here means the
 * response came from something other than this app's route or was corrupted in
 * transit. The honest answer to that is to refuse it, not to draw whatever
 * survived: a chart is read as a whole, and a series with silently dropped
 * bars is a picture of price action that never happened.
 */

import type { Bar } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A real calendar day, not merely a string shaped like one.
 *
 * Date.UTC rolls "2026-02-31" forward into March, so a shape test alone would
 * date a session to a day that never existed — the same trap seriesAgeDays
 * guards against, and for the same reason.
 */
export function isCalendarDay(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, day));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === day;
}

/** A full UTC instant, and a real one — same round-trip check, same reason. */
export function isInstant(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(d)) return false;
  const at = new Date(d);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 19) === d.slice(0, 19);
}

/**
 * Map one row into a Bar, or null when it is not one.
 *
 * Every price must describe a stretch of trading that could have happened. A
 * high is the highest it traded and a low the lowest, so the open and the
 * close both sit between them; a bar whose open is above its own high draws a
 * wick pointing the wrong way, and a reader cannot see through that. Prices
 * are positive by definition and a negative volume is not a smaller volume.
 * Nothing is clamped — the honest answer to a nonsense bar is not a guess
 * about which field was wrong.
 *
 * A zero volume is kept: a session or a five-minute window in which nothing
 * changed hands is a real answer.
 */
export function mapBarRow(raw: unknown, isStamp: (d: unknown) => d is string): Bar | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { d, o, h, l, c, v } = raw as Record<string, unknown>;
  if (!isStamp(d)) return null;
  if (!isNum(o) || !isNum(h) || !isNum(l) || !isNum(c) || !isNum(v)) return null;
  if (o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0) return null;
  if (l > h || o < l || o > h || c < l || c > h) return null;
  return { date: d, open: o, high: h, low: l, close: c, volume: v };
}
