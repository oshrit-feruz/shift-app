/**
 * LIVE data source — Recovery Detector engine, read from a daily mirror.
 *
 * Three readers share this file, because they share one snapshot: the
 * Satellite card's BUY candidates, a single stock's ranking row, and the list
 * of tickers the engine has a view on. Prices are NOT among them any more —
 * they come from data/quotes.ts, live, per ticker. This file is the engine's
 * opinion, not a price feed.
 *
 * WHY A MIRROR RATHER THAN A LIVE CALL:
 * The engine runs on Render's free tier, which sleeps after ~15 minutes idle
 * and takes 30-60s to wake. The screener only recomputes once a day (its own
 * response says so in `computed_on`), so paying a cold start on every visit
 * bought nothing but latency. A GitHub Action fetches the day's result and
 * commits it to this repo (.github/workflows/mirror-screener.yml), and the app
 * reads that static file from Vercel's edge — no Render round trip at all.
 * Anything that genuinely has to be fresh — news, and every price in the app —
 * goes through Vercel functions instead, not through here.
 *
 * WHICH ENDPOINT AND WHY:
 * The engine exposes both /api/screener (today's ranked candidates) and
 * /api/beta/dashboard (the beta paper-trading book). The card shows the
 * screener's BUY signals, because the dashboard's `open_positions` only fills
 * once someone actually opens a position via POST /api/positions/open — until
 * then it is legitimately empty, and an empty card is not what this surface is
 * for. The screener recomputes daily and is the engine's actual output.
 *
 * DATA HONESTY CONTRACT (this file is the reason the contract exists):
 * - A successful response with zero BUY signals returns ok([]) — the UI then
 *   shows the honest "no candidates today" empty state. Zero signals is a
 *   real, expected answer from this engine on a quiet day, NOT an error.
 * - Any failure — network, CORS, timeout, non-2xx, unparseable body, or a
 *   body whose shape we do not recognise — returns 'unavailable'. It must
 *   NEVER fall back to demo numbers: showing invented tickers as if the
 *   engine had picked them is the exact failure mode switching to live data
 *   is meant to eliminate.
 * - Individual missing numeric fields become null, and render as "—".
 *   A candidate with an unknown price is shown with an unknown price; the
 *   number is never guessed or back-filled.
 * - A snapshot older than MAX_SNAPSHOT_AGE_DAYS is reported as unavailable
 *   with the age in the reason, NOT served silently. Stale signals presented
 *   as today's are the same lie as invented ones — the mirror failing for a
 *   week must look like a failure, not like a quiet market.
 */

import { cachedLoadable } from './loadableCache';
import {
  ok,
  unavailable,
  type Loadable,
  type SatellitePolicy,
  type SatelliteSignal,
  type StockRadar,
} from './types';

/**
 * The mirrored snapshot, served as a static file from the same origin as the
 * app. Written daily by .github/workflows/mirror-screener.yml.
 */
export const SCREENER_MIRROR_URL = '/data/screener.json';

/**
 * The engine's own origin. Nothing in this file calls it any more — the
 * screener is mirrored — but per-ticker, on-demand endpoints
 * (e.g. /api/stock/{ticker}/fundamentals) cannot be pre-mirrored the way a
 * single daily ranking can, so they will keep calling Render directly and
 * will still pay a cold start of up to ~60s on the first request after an
 * idle period. Anything built against this base needs a loading state that
 * survives that wait (see TIMEOUT_MS) rather than giving up after a second
 * or two.
 */
export const RECOVERY_DETECTOR_ORIGIN = 'https://stock-screener-7lvr.onrender.com';

/**
 * Kept for any direct call to the live screener (diagnostics, a manual
 * refresh). The app's normal read path is SCREENER_MIRROR_URL.
 */
export const RECOVERY_DETECTOR_URL = `${RECOVERY_DETECTOR_ORIGIN}/api/screener`;

/**
 * Generous on purpose for calls that reach Render directly: an observed cold
 * start exceeded 45s. Reads of the local mirror never need anything like this,
 * but they share the ceiling — a same-origin static file that somehow takes
 * this long is broken by any measure.
 */
const TIMEOUT_MS = 60_000;

/**
 * How old the mirrored snapshot may be before the app stops trusting it.
 * Four days covers a long weekend (Friday's run is the last one before a
 * Monday holiday, read on Tuesday) without ever letting a genuinely broken
 * mirror pass as current.
 */
export const MAX_SNAPSHOT_AGE_DAYS = 4;

/** Accepts a number or a numeric string; anything else (or non-finite) → null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    // Tolerate "$123.45" / "1,234.5" shaped values without inventing anything.
    const cleaned = trimmed.replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Return the first non-empty string value found among the given keys in the row, or null if none exist. */
function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Return the first parseable finite number found among the given keys in the row, or null if none exist. */
function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (k in row) {
      const n = toNumber(row[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Map one raw screener row to a SatelliteSignal.
 * Field-name variants are accepted defensively because the engine's payload
 * shape is not contractually frozen. Returns null when the row has no usable
 * ticker — a candidate with no identity cannot be rendered or navigated to.
 */
export function mapSignal(raw: unknown): SatelliteSignal | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const ticker = pickString(row, ['ticker', 'symbol']);
  if (!ticker) return null;

  // An unrecognised verdict is reported as-is rather than coerced to BUY.
  const rawSignal = pickString(row, ['signal']);
  const signal = rawSignal === 'BUY' || rawSignal === 'WATCH' || rawSignal === 'SKIP' ? rawSignal : null;

  return {
    ticker: ticker.toUpperCase(),
    price: pickNumber(row, ['price', 'current_price', 'last']),
    high52w: pickNumber(row, ['high_52w', 'high52w']),
    drawdownPct: pickNumber(row, ['drawdown_pct', 'drawdown']),
    compositeScore: pickNumber(row, ['composite_score', 'score']),
    signal,
    // Strictly a boolean or nothing: a string "true", a 1, or an absent key
    // all read as "the engine did not say", never as actionable.
    active: typeof row.active === 'boolean' ? row.active : null,
  };
}

/**
 * The names a client can act on today: the engine said BUY *and* did not say
 * "not now". A BUY the engine marks inactive is a real verdict and stays in
 * the ranking, but it is not shown as something to buy.
 *
 * `active === null` — a snapshot that predates the field — passes through, so
 * an older mirror renders exactly as it did before the field existed: the
 * engine has not said "not now", it has said nothing.
 */
export function actionableSignals(signals: SatelliteSignal[]): SatelliteSignal[] {
  return signals.filter((s) => s.active !== false);
}

/**
 * The engine's sizing policy from a parsed screener body, or null when the
 * body carries none (older snapshots) or carries one we cannot use. Both
 * figures must be finite and positive: a policy of "0% per name" or "at most
 * 0 names" is not a rule, it is a broken payload, and nothing may be sized
 * from it.
 */
export function extractPolicy(body: unknown): SatellitePolicy | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).satellite_policy;
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const policy = raw as Record<string, unknown>;
  const sleevePctOfBudget = pickNumber(policy, ['sleeve_pct_of_budget']);
  const maxSleeves = pickNumber(policy, ['max_sleeves']);
  if (sleevePctOfBudget === null || maxSleeves === null) return null;
  // The cap is a count of names, so it is floored before it is judged: a cap
  // of 0.5 is a cap of 0. And the slices must fit the budget they are cut
  // from — a 60% slice with a cap of 2 would put 120% of the sleeve to work.
  const cappedSleeves = Math.floor(maxSleeves);
  if (
    sleevePctOfBudget <= 0 ||
    sleevePctOfBudget > 100 ||
    cappedSleeves < 1 ||
    sleevePctOfBudget * cappedSleeves > 100
  ) {
    return null;
  }
  return { sleevePctOfBudget, maxSleeves: cappedSleeves };
}

/**
 * Candidates plus policy from one body. Null (→ 'unavailable') exactly when
 * the candidates are unrecognisable; a missing policy is a real, expected
 * answer from an older snapshot and comes back as `policy: null`.
 */
export function extractStockRadar(body: unknown): StockRadar | null {
  const signals = extractBuySignals(body);
  if (signals === null) return null;
  return { signals, policy: extractPolicy(body) };
}

/**
 * Extract the BUY candidates from a parsed screener body.
 *
 * Prefers the engine's own `buy_signals` list. Falls back to filtering
 * `full_ranking` for signal === 'BUY' only when `buy_signals` is absent —
 * that is a derivation from data the engine actually sent, not an invention.
 * Returns null when neither array is present: we cannot honestly report
 * "no candidates today" from a response we do not understand, so that case is
 * surfaced as 'unavailable' by the caller.
 */
export function extractBuySignals(body: unknown): SatelliteSignal[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  const buys = obj.buy_signals;
  if (Array.isArray(buys)) {
    return buys.map(mapSignal).filter((s): s is SatelliteSignal => s !== null);
  }

  const ranking = obj.full_ranking;
  if (Array.isArray(ranking)) {
    return ranking.map(mapSignal).filter((s): s is SatelliteSignal => s !== null && s.signal === 'BUY');
  }

  return null;
}

/**
 * Whole days between the snapshot's `computed_on` date and now, or null when
 * the field is missing or unparseable.
 *
 * Compared in UTC on purpose: `computed_on` is a bare YYYY-MM-DD from a UTC
 * job, so parsing it in the viewer's local zone would shift it by a day for
 * anyone west of UTC and make a fresh snapshot look a day older than it is.
 */
export function snapshotAgeDays(computedOn: unknown, now: Date = new Date()): number | null {
  if (typeof computedOn !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(computedOn.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const stamped = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(stamped)) return null;

  // Date.UTC silently rolls impossible dates forward — Date.UTC(2026, 7, 99)
  // lands in November, and "2026-13-45" lands in 2027. Left unchecked that is
  // not merely sloppy: a rolled-forward date produces a *negative* age, which
  // sails past the "older than MAX" gate and lets a garbage snapshot read as
  // fresh. Round-tripping the parsed fields is what makes the age check
  // trustworthy rather than bypassable.
  const back = new Date(stamped);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - stamped) / 86_400_000);
}

/**
 * Look up one ticker's row in the mirrored ranking.
 *
 * The Satellite card wants only the BUY candidates; a stock's own page wants
 * whatever the engine knows about *that* ticker regardless of verdict, so
 * this returns the row for any ranked ticker and null for one the engine
 * did not rank. Null is a real answer here — most tickers are simply not in
 * a 100-name ranking — and the caller renders it as "not covered", which is
 * different from the snapshot being unreadable.
 */
export function findRankingRow(body: unknown, ticker: string): SatelliteSignal | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const ranking = (body as Record<string, unknown>).full_ranking;
  if (!Array.isArray(ranking)) return null;

  const want = ticker.trim().toUpperCase();
  if (!want) return null;

  for (const raw of ranking) {
    const mapped = mapSignal(raw);
    if (mapped && mapped.ticker === want) return mapped;
  }
  return null;
}

/**
 * A snapshot may read at most this far into the future before we stop trusting
 * it. One day of slack absorbs a viewer whose device clock is a little behind
 * UTC; anything beyond that is a real date problem, not skew, and a
 * future-dated snapshot must not be allowed to pass the freshness gate simply
 * because its age is negative.
 */
const MAX_FUTURE_SKEW_DAYS = 1;

/**
 * Read the mirrored snapshot and hand the caller whatever it needs out of it.
 *
 * Both readers of the mirror — the Satellite card's BUY list and a single
 * stock's ranking row — need identical transport, freshness and honesty
 * handling, and the one thing that must never happen is the two drifting so
 * that one serves a snapshot the other rejects. So the shared part lives
 * here exactly once and `extract` supplies only the per-caller shape check.
 *
 * `extract` returns null when the body is not a shape it recognises, which
 * becomes 'unavailable'. Note the ordering: the shape check runs BEFORE the
 * age check, so a malformed file is reported as malformed rather than
 * sending someone chasing a staleness problem it does not have.
 *
 * Never throws. `fetchImpl` and `now` are injectable so every honest-state
 * branch can be tested without a network or a clock.
 */
async function readMirror<T>(
  extract: (body: unknown) => T | null,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<T>> {
  // The snapshot changes once a day, but several screens read it (the
  // Satellite card, every stock page's ranking row, the first-purchase flow).
  // Cache the transport+parse for the default fetch so one download serves
  // them all; the shape and freshness checks below still run per call. An
  // injected test fetchImpl bypasses the cache to keep tests isolated.
  const bodyRes =
    fetchImpl === fetch
      ? await cachedLoadable('screener-mirror', MIRROR_CACHE_MS, () => fetchMirrorBody(fetch))
      : await fetchMirrorBody(fetchImpl);
  if (bodyRes.status !== 'ok') {
    // 'unavailable' carries no payload, so its type is caller-agnostic.
    return bodyRes as Loadable<T>;
  }
  const body = bodyRes.data;

  const extracted = extract(body);
  // Unrecognised shape → unavailable, never a fabricated empty result.
  if (extracted === null) return unavailable();

  // Age is checked only after the shape is known good, so a malformed file
  // is reported as malformed rather than as stale.
  const age = snapshotAgeDays(
    (body as Record<string, unknown>).computed_on ?? (body as Record<string, unknown>).as_of,
    now,
  );
  if (age === null) {
    return unavailable({
      en: 'Market data is missing its date, so it cannot be trusted.',
      he: 'לנתוני השוק חסר תאריך, ולכן אי אפשר להסתמך עליהם.',
    });
  }
  if (age > MAX_SNAPSHOT_AGE_DAYS) {
    return unavailable({
      en: `Market data is ${age} days old, so it is no longer current.`,
      he: `נתוני השוק בני ${age} ימים, ולכן אינם עדכניים.`,
    });
  }
  if (age < -MAX_FUTURE_SKEW_DAYS) {
    return unavailable({
      en: 'Market data is dated in the future, so it cannot be trusted.',
      he: 'נתוני השוק מתוארכים לעתיד, ולכן אי אפשר להסתמך עליהם.',
    });
  }

  return ok(extracted);
}

/**
 * How long a downloaded snapshot body is reused. The file is republished
 * once a day, so five minutes of reuse is invisible in freshness terms while
 * collapsing the per-screen re-downloads into one.
 */
const MIRROR_CACHE_MS = 5 * 60_000;

/**
 * Transport + JSON parse for the mirror, with none of the trust checks.
 * Never throws.
 */
async function fetchMirrorBody(fetchImpl: typeof fetch): Promise<Loadable<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SCREENER_MIRROR_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // A 404 here means the mirror file was never published (or was deleted) —
    // worth saying plainly, because unlike a flaky network it will not fix
    // itself on a retry.
    if (res.status === 404) {
      return unavailable({
        en: 'Daily market data has not been published yet.',
        he: 'נתוני השוק היומיים טרם פורסמו.',
      });
    }
    if (!res.ok) return unavailable();
    return ok<unknown>(await res.json());
  } catch {
    // Network failure, abort/timeout, invalid JSON — all honestly
    // 'unavailable'. Deliberately no demo fallback.
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the day's BUY candidates from the mirrored snapshot. Never throws.
 *
 * A genuinely empty list is a valid answer and renders as the empty state.
 */
export async function fetchSatelliteSignals(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<SatelliteSignal[]>> {
  return readMirror(extractBuySignals, fetchImpl, now);
}

/**
 * The Stock Radar screens' read: the day's candidates and the engine's sizing
 * policy from the same snapshot, under the same freshness and honesty rules
 * as fetchSatelliteSignals. Never throws.
 */
export async function fetchStockRadar(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<StockRadar>> {
  return readMirror(extractStockRadar, fetchImpl, now);
}

/**
 * Read one ticker's row from the mirrored ranking. Never throws.
 *
 * Resolves to ok(null) when the snapshot is perfectly good but does not rank
 * this ticker — the common case, since the ranking is 100 names and the app
 * can open any symbol. That is deliberately NOT 'unavailable': there is
 * nothing wrong and nothing to retry, the engine simply has no view on this
 * stock, and the screen says so rather than implying a failure.
 */
export async function fetchRankingRow(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<SatelliteSignal | null>> {
  const snap = await readMirror(
    (body) => {
      // Distinguishes "snapshot unreadable" (null → unavailable) from
      // "readable, ticker simply absent" (a box holding null → ok(null)).
      // Collapsing the two would report a healthy snapshot as broken every
      // time someone opened an unranked stock.
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
      if (!Array.isArray((body as Record<string, unknown>).full_ranking)) return null;
      return { row: findRankingRow(body, ticker) };
    },
    fetchImpl,
    now,
  );
  return snap.status === 'ok' ? ok(snap.data.row) : snap;
}

/**
 * Every ticker the day's ranking covers, upper-cased.
 *
 * This used to be a quote map: the ranking carried a `price` and a
 * `high_52w` for its ~100 names, and that was the app's only free source of
 * real prices, so every screen's price came from a file that refreshed once a
 * day. Prices are live now (data/quotes.ts), and what is left of this read is
 * the one thing the ranking is actually authoritative about — which symbols
 * the engine has a view on. Search offers them, and a watchlist row shows
 * that it is ranked.
 *
 * Returns null for a body without a recognisable `full_ranking`, which the
 * shared reader turns into 'unavailable'. Rows with no usable ticker are
 * dropped; a row whose numbers the engine omitted is still a ranked ticker,
 * so it is kept.
 */
export function extractRankedTickers(body: unknown): string[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const ranking = (body as Record<string, unknown>).full_ranking;
  if (!Array.isArray(ranking)) return null;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ranking) {
    const mapped = mapSignal(raw);
    if (mapped && !seen.has(mapped.ticker)) {
      seen.add(mapped.ticker);
      out.push(mapped.ticker);
    }
  }
  return out;
}

/**
 * Read the day's ranked tickers from the mirrored snapshot. Never throws.
 *
 * An unreadable or stale snapshot is 'unavailable', and the screens that use
 * this treat that as "the engine has no view today" — search still lists the
 * sample table and the user's own watchlist, because neither depends on the
 * engine to exist.
 */
export async function fetchRankedTickers(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<string[]>> {
  return readMirror(extractRankedTickers, fetchImpl, now);
}
