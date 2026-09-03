import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateEarningsRule,
  evaluateNewsRule,
  evaluatePriceRule,
  evaluateThresholds,
  isoDayUtc,
  newsRuleKey,
  priceRuleKey,
  readLevel,
  type Evaluation,
  type HeldPosition,
} from './_lib/alerts.js';
import {
  deliverPush,
  hasPriceRules,
  inBatches,
  loadPositions,
  loadStates,
  loadUsers,
  outcomeKey,
  persistOutcomes,
  PRICE_WORKER,
  readHeartbeat,
  workerAlive,
  type Outcome,
  type StateMap,
  type StoreFailure,
  type UserRules,
  type UserState,
} from './_lib/alertStore.js';
import { parseCalendarCsv, readApiError } from './_lib/alphavantage.js';
import type { EarningsRow } from './_lib/earnings.js';
import { resolveSymbol } from './_lib/eodhd.js';
import { mapQuote, quoteUrl } from './_lib/finnhub.js';
import { readBearerToken, type ApiRequest, type ApiResponse } from './_lib/http.js';
import { mapArticle, type NewsArticle } from './_lib/news.js';
import { fetchUpstreamJson } from './_lib/upstream.js';

/**
 * The alert engine's scheduled run: POST /api/alerts-run?scope=prices|news|daily
 *
 * This is what makes an alert a thing that happens rather than a row in a
 * list. Every user's rules (`savedAlerts` and the two Settings thresholds in
 * user_state.state) are read against live data, what crossed is written to
 * `notifications` — the notification centre's contents — and pushed to the
 * devices that subscribed. The deciding is all in _lib/alerts.ts, as pure
 * functions with their own tests; the reading and writing is _lib/alertStore.ts,
 * shared with the price worker; this file gathers inputs per scope.
 *
 * WHO MAY CALL IT. Nobody in a browser. The caller proves it holds
 * ALERTS_CRON_SECRET (the scheduled workflow in .github/workflows/alerts.yml
 * does), compared in constant time, and the route reads and writes every
 * user's rows with the service-role key — which is exactly why the guard is
 * the first thing here and the key never reaches a client.
 *
 * THREE SCOPES, because the three inputs have three prices:
 *   prices — Finnhub quotes, one call per symbol, every few minutes during
 *            the US session. The same provider every screen prints. THIS IS
 *            THE FALLBACK: while the price worker (worker/main.ts) reports a
 *            fresh heartbeat it is checking the same rules on every trade,
 *            and this scope stands down rather than let two providers argue
 *            over the cents around a level. It takes over the moment the
 *            heartbeat goes stale.
 *   news   — EODHD's per-ticker news, ten credits a ticker, every half hour.
 *   daily  — Alpha Vantage's calendar, whose free key allows a couple of
 *            dozen calls a day, once each morning.
 *
 * DATA HONESTY, same contract as every other route: a symbol whose quote
 * failed or is absent is simply not evaluated this run — its rules keep
 * whatever side they last recorded and nothing fires on a price we do not
 * have. Every upstream failure is counted in the response, never hidden.
 *
 * SHAPE OF THE FILE. The handler is a straight line: guard, load, gather
 * (one function per scope), persist, push, answer. Each step is its own
 * function that either returns what the next needs or a `Failure` to send,
 * so the handler reads as the sequence it is rather than as one long body.
 */

export const SCOPES = ['prices', 'news', 'daily'] as const;
export type Scope = (typeof SCOPES)[number];

/** Budget per upstream call. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8_000;
/** Finnhub's free key allows 60 calls a minute; one run stays well inside it. */
export const MAX_QUOTE_SYMBOLS = 50;
/** Ten credits each on EODHD; thirty tickers is 300 of a 100,000 daily allowance. */
export const MAX_NEWS_SYMBOLS = 30;
/** Articles fetched per news ticker. The rule fires for at most three of them. */
const NEWS_ARTICLES = 10;

const EODHD_NEWS_URL = 'https://eodhd.com/api/news';
const ALPHAVANTAGE_URL = 'https://www.alphavantage.co/query';

const NOT_CONFIGURED = { error: 'not_configured', message: 'The alert engine is not configured.' };

/** An answer to send instead of continuing. */
interface Failure {
  status: number;
  body: Record<string, unknown>;
}

/** Everything one run carries from step to step. */
interface Run {
  db: SupabaseClient;
  scope: Scope;
  providerKey: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  now: Date;
  today: string;
  users: UserRules[];
  states: StateMap;
  outcomes: Outcome[];
  writes: UserState[];
  /** Counts of what was asked upstream and what failed, for the response. */
  upstream: Record<string, number>;
  /**
   * When set, the only symbols this run may evaluate — the ones a live
   * worker told us it is NOT watching. Absent means everything, which is
   * what a run with no worker behind it does.
   */
  only?: Set<string>;
  /** What the live worker reported, echoed in the response when it shaped this run. */
  worker?: { heartbeat: string; uncovered: number };
}

export function isScope(v: unknown): v is Scope {
  return typeof v === 'string' && (SCOPES as readonly string[]).includes(v);
}

/** A query parameter given once, or undefined when absent or repeated. */
function singleParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v.length === 1 ? v[0] : undefined;
  return v;
}

/** Constant-time equality, false for different lengths, so a prefix guess learns nothing from timing. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Which users a scope concerns. Everyone else's rows are not even read. */
function concerns(scope: Scope): (u: UserRules) => boolean {
  switch (scope) {
    case 'prices':
      return hasPriceRules;
    case 'news':
      return (u) => u.rules.some((r) => r.kind === 'news');
    default:
      return (u) => u.rules.some((r) => r.kind === 'earn');
  }
}

function dbFailure(f: StoreFailure): Failure {
  console.error(`/api/alerts-run: ${f.table} query failed: ${f.detail}`);
  return { status: 502, body: { error: 'db_error', message: `Could not read or write ${f.table}.` } };
}

function send(res: ApiResponse, f: Failure) {
  return res.status(f.status).json(f.body);
}

/**
 * Builds the handler with an injectable upstream budget, fetch and clock,
 * the way the other routes do. `fetchImpl` is handed to the Supabase client
 * as well, so a test can stand in for the database with the same stub.
 */
export function createHandler(
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
    }
    const scope = singleParam(req.query.scope);
    if (!isScope(scope)) {
      return res
        .status(400)
        .json({ error: 'invalid_scope', message: 'Query param "scope" must be prices, news or daily.' });
    }

    const guarded = guard(req, scope);
    if ('status' in guarded) return send(res, guarded);

    const now = clock();
    const run: Run = {
      db: createClient(guarded.url, guarded.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetchImpl },
      }),
      scope,
      providerKey: guarded.providerKey,
      timeoutMs,
      fetchImpl,
      now,
      today: isoDayUtc(now),
      users: [],
      states: new Map(),
      outcomes: [],
      writes: [],
      upstream: {},
    };

    if (scope === 'prices') {
      const beat = await readHeartbeat(run.db, PRICE_WORKER);
      if (beat !== null && workerAlive(beat, now)) {
        // A live worker is not the same as a covered one. Its socket takes a
        // fixed number of symbols and names the overflow in its heartbeat; it
        // never receives a trade for those, so standing down completely would
        // leave them checked by nobody. Stand down for what it covers, and
        // check the rest here on the schedule.
        if (beat.uncovered.length === 0) {
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({
            scope,
            today: run.today,
            skipped: 'worker_alive',
            workerHeartbeat: beat.at.toISOString(),
          });
        }
        run.only = new Set(beat.uncovered);
        run.worker = { heartbeat: beat.at.toISOString(), uncovered: beat.uncovered.length };
      }
    }

    const loaded = await load(run);
    if (loaded) return send(res, loaded);
    if (run.users.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ scope, today: run.today, users: 0, fired: 0, pushed: 0 });
    }

    const gathered = await GATHER[scope](run);
    if (gathered) return send(res, gathered);

    const persisted = await persistOutcomes(run.db, run.outcomes, run.writes, now);
    if (!persisted.ok) {
      // Rows may already be written even though the run is about to report a
      // failure. The next run will not push them — they exist, so they come
      // back as duplicates and look like nothing new — so this one does,
      // before it answers.
      await pushInserted(run, persisted.inserted);
      return send(res, dbFailure(persisted.failure));
    }
    const inserted = persisted.value;

    const push = await pushInserted(run, inserted);

    // Success only. A failure above must keep reaching this function so a
    // real recovery shows up on the next run, not after a cached error.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      scope,
      today: run.today,
      users: run.users.length,
      // Firings the engine produced this run, and how many of them were new
      // rows rather than repeats of an event already recorded.
      fired: run.outcomes.length,
      recorded: inserted.size,
      statesWritten: run.writes.length,
      ...push,
      upstream: run.upstream,
      // Present only when a live worker narrowed this run to its overflow.
      ...(run.worker ? { worker: run.worker } : {}),
    });
  };
}

/** Deliver the firings that became new rows this run, and only those. */
async function pushInserted(run: Run, inserted: Set<string>) {
  const toPush = run.outcomes.filter((o) => o.push && inserted.has(outcomeKey(o)));
  return deliverPush(run.db, toPush);
}

// ── Guard ────────────────────────────────────────────────────────────────

/**
 * Who may call, and what this deployment has. The secret is checked BEFORE
 * every other configuration: an unauthenticated caller must learn nothing
 * about how this deployment is set up, not even that it is missing a key.
 */
function guard(
  req: ApiRequest,
  scope: Scope,
): { url: string; serviceKey: string; providerKey: string } | Failure {
  const secret = process.env.ALERTS_CRON_SECRET;
  if (!secret) {
    console.error('/api/alerts-run: ALERTS_CRON_SECRET is not set');
    return { status: 500, body: NOT_CONFIGURED };
  }
  const token = readBearerToken(req);
  if (!token || !secretMatches(token, secret)) {
    return { status: 401, body: { error: 'unauthorized', message: 'Missing or invalid bearer token.' } };
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('/api/alerts-run: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set');
    return { status: 500, body: NOT_CONFIGURED };
  }
  const providerKey = {
    prices: process.env.FINNHUB_API_KEY,
    news: process.env.EODHD_API_KEY,
    daily: process.env.ALPHAVANTAGE_API_KEY,
  }[scope];
  if (!providerKey) {
    console.error(`/api/alerts-run: the ${scope} provider key is not set`);
    return { status: 500, body: NOT_CONFIGURED };
  }
  return { url, serviceKey, providerKey };
}

// ── Load ─────────────────────────────────────────────────────────────────

/** Whose rules this scope concerns, and what the engine remembered about them. */
async function load(run: Run): Promise<Failure | null> {
  const users = await loadUsers(run.db, concerns(run.scope));
  if (!users.ok) return dbFailure(users.failure);
  run.users = users.value;
  if (run.users.length === 0) return null;
  const states = await loadStates(
    run.db,
    run.users.map((u) => u.userId),
  );
  if (!states.ok) return dbFailure(states.failure);
  run.states = states.value;
  return null;
}

function prevFor(run: Run, userId: string): Record<string, string> {
  return run.states.get(userId) ?? {};
}

/** Record one evaluation's firings and states against a user. */
function collect(run: Run, userId: string, push: boolean, ev: Evaluation): void {
  for (const firing of ev.firings) run.outcomes.push({ userId, firing, push });
  for (const s of ev.states) run.writes.push({ userId, ...s });
}

/** The tickers a scope needs, bounded, with the overflow counted rather than silently dropped. */
function askedSymbols(run: Run, wanted: Set<string>, max: number): string[] {
  const symbols = [...wanted].sort((a, b) => a.localeCompare(b));
  const asked = symbols.slice(0, max);
  run.upstream.symbols = asked.length;
  run.upstream.symbolsSkipped = symbols.length - asked.length;
  return asked;
}

// ── Gather: prices ───────────────────────────────────────────────────────

const GATHER: Record<Scope, (run: Run) => Promise<Failure | null>> = {
  prices: gatherPrices,
  news: gatherNews,
  daily: gatherDaily,
};

async function gatherPrices(run: Run): Promise<Failure | null> {
  const thresholdUsers = run.users.filter((u) => u.thresholds.up !== null || u.thresholds.down !== null);
  const positions = await loadPositions(
    run.db,
    thresholdUsers.map((u) => u.userId),
  );
  if (!positions.ok) return dbFailure(positions.failure);

  const wanted = coveredHere(run, wantedPriceSymbols(run.users, positions.value));
  const quotes = await fetchPrices(run, askedSymbols(run, wanted, MAX_QUOTE_SYMBOLS));
  for (const u of run.users) {
    evaluatePriceUser(run, u, positions.value.get(u.userId) ?? [], quotes);
  }
  return null;
}

/**
 * Narrowed to what this run is responsible for. With a live worker that is
 * only the symbols its socket could not fit; with no worker, everything.
 */
function coveredHere(run: Run, wanted: Set<string>): Set<string> {
  if (run.only === undefined) return wanted;
  return new Set([...wanted].filter((s) => run.only?.has(s)));
}

/** Every price rule's ticker with a readable level, and every held ticker of a user with a threshold. */
function wantedPriceSymbols(users: UserRules[], positions: Map<string, HeldPosition[]>): Set<string> {
  const wanted = new Set<string>();
  for (const u of users) {
    for (const r of u.rules) if (r.kind === 'price' && readLevel(r) !== null) wanted.add(r.ticker);
    for (const p of positions.get(u.userId) ?? []) wanted.add(p.ticker);
  }
  return wanted;
}

/** One user's price rules and thresholds against the quotes this run fetched. */
function evaluatePriceUser(
  run: Run,
  u: UserRules,
  held: HeldPosition[],
  quotes: Record<string, number>,
): void {
  const prev = prevFor(run, u.userId);
  for (const r of u.rules) {
    if (r.kind !== 'price') continue;
    const level = readLevel(r);
    const price = quotes[r.ticker];
    if (level === null || price === undefined) continue;
    const stored = prev[priceRuleKey(r.ticker, level)];
    collect(run, u.userId, r.notifyBy.push, evaluatePriceRule(r, price, stored, run.today));
  }
  collect(run, u.userId, true, evaluateThresholds(held, u.thresholds, quotes, prev, run.today));
}

/** Last prices from Finnhub, keyed by ticker; a failed or absent quote is simply not in the map. */
async function fetchPrices(run: Run, symbols: string[]): Promise<Record<string, number>> {
  const quotes: Record<string, number> = {};
  let failed = 0;
  await inBatches(symbols, async (symbol) => {
    const r = await fetchUpstreamJson(
      quoteUrl(symbol, run.providerKey),
      run.timeoutMs,
      'quote',
      '/api/alerts-run',
      run.fetchImpl,
    );
    if (!r.ok) {
      failed += 1;
      return;
    }
    const q = mapQuote(r.body);
    if (q) quotes[symbol] = q.price;
  });
  run.upstream.quoteFailures = failed;
  return quotes;
}

// ── Gather: news ─────────────────────────────────────────────────────────

async function gatherNews(run: Run): Promise<Failure | null> {
  const wanted = new Set<string>();
  for (const u of run.users) for (const r of u.rules) if (r.kind === 'news') wanted.add(r.ticker);
  const articles = await fetchArticles(run, askedSymbols(run, wanted, MAX_NEWS_SYMBOLS));

  for (const u of run.users) {
    const prev = prevFor(run, u.userId);
    for (const r of u.rules) {
      if (r.kind !== 'news') continue;
      const list = articles.get(r.ticker);
      // A ticker whose fetch failed is not evaluated: with no list there is
      // no "newest article" to arm on, and arming on "now" would let the
      // coverage of the outage pass unreported.
      if (!list) continue;
      collect(run, u.userId, r.notifyBy.push, evaluateNewsRule(r, list, prev[newsRuleKey(r)], run.now));
    }
  }
  return null;
}

/** The latest articles per ticker from EODHD; a ticker whose fetch failed is absent from the map. */
async function fetchArticles(run: Run, tickers: string[]): Promise<Map<string, NewsArticle[]>> {
  const articles = new Map<string, NewsArticle[]>();
  let failed = 0;
  await inBatches(tickers, async (ticker) => {
    const u = new URL(EODHD_NEWS_URL);
    u.searchParams.set('s', resolveSymbol(ticker));
    u.searchParams.set('api_token', run.providerKey);
    u.searchParams.set('fmt', 'json');
    u.searchParams.set('limit', String(NEWS_ARTICLES));
    const r = await fetchUpstreamJson(u, run.timeoutMs, 'news', '/api/alerts-run', run.fetchImpl);
    if (!r.ok || !Array.isArray(r.body)) {
      failed += 1;
      return;
    }
    articles.set(
      ticker,
      r.body.map(mapArticle).filter((a): a is NewsArticle => a !== null),
    );
  });
  run.upstream.newsFailures = failed;
  return articles;
}

// ── Gather: daily ────────────────────────────────────────────────────────

async function gatherDaily(run: Run): Promise<Failure | null> {
  const calendar = await fetchCalendar(run);
  if (calendar === null) {
    return {
      status: 502,
      body: {
        error: 'upstream_error',
        message: 'The earnings calendar could not be read; no earnings reminder was evaluated.',
      },
    };
  }
  run.upstream.calendarRows = calendar.length;
  for (const u of run.users) {
    const prev = prevFor(run, u.userId);
    for (const r of u.rules) {
      if (r.kind !== 'earn') continue;
      const stored = prev[`earn|${r.ticker}|lands`];
      collect(run, u.userId, r.notifyBy.push, evaluateEarningsRule(r, calendar, stored, run.today));
    }
  }
  return null;
}

/**
 * The market-wide earnings calendar, three months out, or null when it could
 * not be read. Alpha Vantage signals its own errors with HTTP 200 and a JSON
 * body, so a body that parses as JSON is checked for one before the CSV
 * parser sees it — see _lib/alphavantage.ts.
 */
async function fetchCalendar(run: Run): Promise<EarningsRow[] | null> {
  const u = new URL(ALPHAVANTAGE_URL);
  u.searchParams.set('function', 'EARNINGS_CALENDAR');
  u.searchParams.set('horizon', '3month');
  u.searchParams.set('apikey', run.providerKey);
  const r = await fetchUpstreamJson(u, run.timeoutMs, 'earnings', '/api/alerts-run', run.fetchImpl, 'text');
  if (!r.ok || typeof r.body !== 'string') return null;
  const text = r.body.trim();
  if (text.startsWith('{')) {
    try {
      const notice = readApiError(JSON.parse(text));
      console.error(`/api/alerts-run: calendar provider notice: ${notice?.kind ?? 'unknown'}`);
    } catch {
      console.error('/api/alerts-run: calendar body was neither CSV nor a provider notice');
    }
    return null;
  }
  return parseCalendarCsv(text);
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
