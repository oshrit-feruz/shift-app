#!/usr/bin/env node
/**
 * Publishes the daily price history the app's charts read.
 *
 * WHY A MIRROR, AND WHY A SCRIPT RATHER THAN THE BROWSER:
 * Alpha Vantage's free key allows tens of requests a day and must stay
 * server-side, so the browser can never call it — one visitor walking a few
 * stock pages would spend the day's quota for everyone. Daily bars also
 * change once a day by definition. So this runs in CI once a day and commits
 * the result, exactly like .github/workflows/mirror-screener.yml does for the
 * screener: the app then reads a static file from Vercel's edge, at no API
 * cost and with no key in the client.
 *
 * WHY A NODE SCRIPT RATHER THAN INLINE BASH:
 * The screener mirror is a dozen jq assertions in YAML, which is as far as
 * that approach stretches. This job has to map a nested object into a sorted
 * series, tolerate a ticker the provider does not cover while failing on a
 * spent quota, and leave the previous good file untouched in both cases.
 * That is program logic, and it belongs somewhere runnable — and testable —
 * outside a workflow runner.
 *
 * PUBLISHING CONTRACT (the same one the screener mirror keeps):
 * - Verify before writing. A ticker's file is replaced only after its payload
 *   has parsed into a non-empty, correctly shaped series, so a bad fetch can
 *   never overwrite the last good file.
 * - Partial success is success. A provider that has no data for one symbol
 *   (MDA trades in Toronto, not on a US tape) must not cost the other nine
 *   their refresh. That ticker is skipped and reported; the app renders it as
 *   honestly chartless.
 * - Total failure is failure. If no ticker was published, the job exits
 *   non-zero rather than reporting a quiet success over a stale directory.
 * - A spent quota aborts the run immediately. Continuing would burn the
 *   remaining calls on responses that cannot succeed, and every one of them
 *   would be indistinguishable from "this symbol has no data".
 *
 * Usage:
 *   ALPHAVANTAGE_API_KEY=... node scripts/mirror-prices.mjs
 *   ALPHAVANTAGE_API_KEY=demo node scripts/mirror-prices.mjs --only=IBM --out=/tmp/series
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const API_URL = 'https://www.alphavantage.co/query';

/**
 * How many trailing sessions to keep per ticker.
 *
 * The longest window the chart offers is a year (~252 sessions); the rest is
 * headroom so a moving average has something to average over at the left edge
 * of that window. Keeping the provider's full twenty-odd years would put
 * megabytes of history nobody can see into a file the browser downloads and
 * a commit rewrites every day.
 */
const MAX_BARS = 340;

/** Per-request budget. The provider is usually well under a second; a minute is a hung connection. */
const TIMEOUT_MS = 60_000;

/**
 * Spacing between requests. The free key's published ceiling is per-day, but
 * it also throttles per-minute, and a burst of ten reads as abuse. Ten tickers
 * at this spacing is under three minutes of CI time, which is free; getting
 * rate-limited and publishing nothing is not.
 */
const REQUEST_SPACING_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tickers to publish, from the file the app reads too. */
function coveredTickers() {
  const raw = readFileSync(join(ROOT, 'app/src/data/coveredTickers.json'), 'utf8');
  const list = JSON.parse(raw).tickers;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('coveredTickers.json carries no tickers');
  }
  return list;
}

/**
 * Alpha Vantage reports its own failures with HTTP 200 and a JSON body, so a
 * caller that checks only the status reads a spent quota as an empty series.
 * Returns a reason string when the body is an error, else null.
 *
 * `Note` and `Information` are the quota and throttle notices; `Error Message`
 * is an unknown symbol or malformed request.
 */
export function readApiError(body) {
  if (body === null || typeof body !== 'object') return 'response is not a JSON object';
  for (const key of ['Error Message', 'Note', 'Information']) {
    const v = body[key];
    if (typeof v === 'string' && v.trim() !== '') return `${key}: ${v.trim()}`;
  }
  return null;
}

/** True for the error bodies that mean "stop", not "skip this symbol". */
export function isQuotaError(reason) {
  return /rate limit|call frequency|premium|thank you for using/i.test(reason);
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Map the provider's `{ "YYYY-MM-DD": { "1. open": "123.4", ... } }` object
 * into bars sorted oldest-first.
 *
 * Every field is required: a bar missing its close cannot be drawn, and one
 * missing its high or low would draw a wick that is not the day's range.
 * Such a row is dropped rather than patched, and a payload whose rows all
 * drop is returned as null — an unreadable body, never an empty history.
 */
export function mapSeries(body) {
  const series = body?.['Time Series (Daily)'];
  if (series === null || typeof series !== 'object' || Array.isArray(series)) return null;

  const bars = [];
  for (const [date, row] of Object.entries(series)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || row === null || typeof row !== 'object') continue;
    const bar = {
      d: date,
      o: Number(row['1. open']),
      h: Number(row['2. high']),
      l: Number(row['3. low']),
      c: Number(row['4. close']),
      v: Number(row['5. volume']),
    };
    if (![bar.o, bar.h, bar.l, bar.c, bar.v].every(isNum)) continue;
    // A high below the low is not a bar with a small error in it; it is a row
    // whose fields do not mean what they are labelled, and nothing downstream
    // can draw it correctly.
    if (bar.h < bar.l) continue;
    bars.push(bar);
  }
  if (bars.length === 0) return null;

  bars.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return bars.slice(-MAX_BARS);
}

/**
 * The published file for one ticker.
 *
 * `as_of` is the newest session in the series, not the day the job ran: it is
 * what the app measures staleness against, and a file stamped "today" over a
 * series that stops last Tuesday would defeat the freshness gate entirely.
 */
export function buildFile(ticker, bars) {
  return {
    ticker,
    as_of: bars[bars.length - 1].d,
    source: 'alphavantage:TIME_SERIES_DAILY',
    bars,
  };
}

/**
 * Serialise with one bar per line.
 *
 * This file is rewritten daily and committed, so its diff is read by whoever
 * reviews the mirror. One bar per line makes that diff the one bar that was
 * added and the one that aged out; `JSON.stringify(…, 2)` would spread every
 * bar over eight lines and make a one-day change look like a rewrite.
 */
export function serialise(file) {
  const bars = file.bars.map((b) => `    ${JSON.stringify(b)}`).join(',\n');
  return (
    `{\n` +
    `  "ticker": ${JSON.stringify(file.ticker)},\n` +
    `  "as_of": ${JSON.stringify(file.as_of)},\n` +
    `  "source": ${JSON.stringify(file.source)},\n` +
    `  "bars": [\n${bars}\n  ]\n` +
    `}\n`
  );
}

async function fetchTicker(ticker, apiKey) {
  const url = `${API_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json();
    const apiError = readApiError(body);
    if (apiError) return { error: apiError, fatal: isQuotaError(apiError) };
    const bars = mapSeries(body);
    if (!bars) return { error: 'no usable daily bars in the response' };
    return { bars };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const outDir = args.find((a) => a.startsWith('--out='))?.slice('--out='.length)
    ?? join(ROOT, 'app/public/data/series');

  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    console.error('::error::ALPHAVANTAGE_API_KEY is not set — refusing to run');
    process.exit(1);
  }

  const tickers = only ? only.split(',').map((t) => t.trim().toUpperCase()) : coveredTickers();
  mkdirSync(outDir, { recursive: true });

  const published = [];
  const skipped = [];

  for (const [i, ticker] of tickers.entries()) {
    if (i > 0) await sleep(REQUEST_SPACING_MS);
    const result = await fetchTicker(ticker, apiKey);

    if (result.error) {
      if (result.fatal) {
        // Stop rather than spend the rest of the quota on calls that cannot
        // succeed. Whatever was published before this point stays published.
        console.error(`::error::${ticker}: ${result.error} — aborting, quota appears spent`);
        break;
      }
      // Leaves this ticker's previous file exactly as it was.
      console.log(`skip ${ticker}: ${result.error}`);
      skipped.push(ticker);
      continue;
    }

    const file = buildFile(ticker, result.bars);
    writeFileSync(join(outDir, `${ticker}.json`), serialise(file));
    console.log(`ok   ${ticker}: ${file.bars.length} bars, as_of=${file.as_of}`);
    published.push(ticker);
  }

  console.log(`\npublished ${published.length}, skipped ${skipped.length} (${skipped.join(', ') || 'none'})`);

  // A run that published nothing has told us nothing about the market and
  // must not report success over a directory of ageing files.
  if (published.length === 0) {
    console.error('::error::No ticker was published — refusing to report success');
    process.exit(1);
  }
}

// Only run when invoked directly, so the pure helpers above can be imported
// by a test without the script trying to reach the network.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
