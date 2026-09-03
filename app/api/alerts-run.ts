import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { buildPositions } from '../src/lib/positions.js';
import type { ManualTransaction } from '../src/lib/transaction.js';
import {
  evaluateEarningsRule,
  evaluateNewsRule,
  evaluatePriceRule,
  evaluateThresholds,
  isoDayUtc,
  newsRuleKey,
  priceRuleKey,
  pushPayload,
  readLevel,
  readRules,
  readThresholds,
  type AlertRule,
  type Evaluation,
  type Firing,
  type HeldPosition,
  type StateWrite,
} from './_lib/alerts.js';
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
 * functions with their own tests; this file only gathers inputs and writes
 * outputs.
 *
 * WHO MAY CALL IT. Nobody in a browser. The caller proves it holds
 * ALERTS_CRON_SECRET (the scheduled workflow in .github/workflows/alerts.yml
 * does), compared in constant time, and the route reads and writes every
 * user's rows with the service-role key — which is exactly why the guard is
 * the first thing here and the key never reaches a client.
 *
 * THREE SCOPES, because the three inputs have three prices:
 *   prices — Finnhub quotes, one call per symbol, every few minutes during
 *            the US session. The same provider every screen prints, so an
 *            alert fires on the number the reader can see, not on a delayed
 *            one from elsewhere (docs/eodhd-plan-decision.md measured EODHD's
 *            REST quote 15–21 minutes behind).
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
/** Concurrent upstream calls. Two overlapping runs cannot burst the per-minute limit. */
const CONCURRENCY = 4;
/** How long a push may wait in the push service for a phone that is off. */
const PUSH_TTL_SECONDS = 3_600;

const EODHD_NEWS_URL = 'https://eodhd.com/api/news';
const ALPHAVANTAGE_URL = 'https://www.alphavantage.co/query';

const NOT_CONFIGURED = { error: 'not_configured', message: 'The alert engine is not configured.' };

interface UserRules {
  userId: string;
  rules: AlertRule[];
  thresholds: { up: number | null; down: number | null };
}

/** A firing with the delivery choice of the rule that produced it. */
interface Outcome {
  userId: string;
  firing: Firing;
  push: boolean;
}

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
  /** The engine's memory per user: state key → stored side or mark. */
  prevFor: (userId: string) => Record<string, string>;
  outcomes: Outcome[];
  states: Array<StateWrite & { userId: string }>;
  /** Counts of what was asked upstream and what failed, for the response. */
  upstream: Record<string, number>;
}

/** Row shapes as PostgREST returns them. `numeric` columns arrive as strings. */
interface StateRow {
  user_id: string;
  state: unknown;
}
interface AlertStateRow {
  user_id: string;
  key: string;
  state: string;
}
interface TransactionRow {
  user_id: string;
  ticker: string;
  side: 'buy' | 'sell' | 'div';
  shares: string | number;
  price: string | number;
  trade_date: string;
}
interface PushRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: 'en' | 'he';
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
function concerns(scope: Scope, u: UserRules): boolean {
  switch (scope) {
    case 'prices':
      return (
        u.rules.some((r) => r.kind === 'price') || u.thresholds.up !== null || u.thresholds.down !== null
      );
    case 'news':
      return u.rules.some((r) => r.kind === 'news');
    default:
      return u.rules.some((r) => r.kind === 'earn');
  }
}

/** Run `work` over `items` with a fixed number of workers in flight. */
async function inBatches<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await work(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function dbFailure(table: string, detail: string): Failure {
  console.error(`/api/alerts-run: ${table} query failed: ${detail}`);
  return { status: 502, body: { error: 'db_error', message: `Could not read or write ${table}.` } };
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
      prevFor: () => ({}),
      outcomes: [],
      states: [],
      upstream: {},
    };

    const loaded = await loadUsers(run);
    if (loaded) return send(res, loaded);
    if (run.users.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ scope, today: run.today, users: 0, fired: 0, pushed: 0 });
    }

    const gathered = await GATHER[scope](run);
    if (gathered) return send(res, gathered);

    const persisted = await persist(run);
    if ('status' in persisted) return send(res, persisted);

    const toPush = run.outcomes.filter((o) => o.push && persisted.inserted.has(outcomeKey(o)));
    const push = await deliverPush(run.db, toPush);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      scope,
      today: run.today,
      users: run.users.length,
      // Firings the engine produced this run, and how many of them were new
      // rows rather than repeats of an event already recorded.
      fired: run.outcomes.length,
      recorded: persisted.inserted.size,
      statesWritten: run.states.length,
      ...push,
      upstream: run.upstream,
    });
  };
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
async function loadUsers(run: Run): Promise<Failure | null> {
  const stateRows = await run.db.from('user_state').select('user_id,state');
  if (stateRows.error) return dbFailure('user_state', stateRows.error.message);
  run.users = ((stateRows.data ?? []) as StateRow[])
    .map((r) => ({ userId: r.user_id, rules: readRules(r.state), thresholds: readThresholds(r.state) }))
    .filter((u) => concerns(run.scope, u));
  if (run.users.length === 0) return null;

  const userIds = run.users.map((u) => u.userId);
  const stateReads = await run.db.from('alert_states').select('user_id,key,state').in('user_id', userIds);
  if (stateReads.error) return dbFailure('alert_states', stateReads.error.message);
  const remembered = new Map<string, Record<string, string>>();
  for (const row of (stateReads.data ?? []) as AlertStateRow[]) {
    const bag = remembered.get(row.user_id) ?? {};
    bag[row.key] = row.state;
    remembered.set(row.user_id, bag);
  }
  run.prevFor = (userId) => remembered.get(userId) ?? {};
  return null;
}

/** Record one evaluation's firings and states against a user. */
function collect(run: Run, userId: string, push: boolean, ev: Evaluation): void {
  for (const firing of ev.firings) run.outcomes.push({ userId, firing, push });
  for (const s of ev.states) run.states.push({ userId, ...s });
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
  const positions = await loadPositions(run);
  if ('status' in positions) return positions;

  const wanted = new Set<string>();
  for (const u of run.users) {
    for (const r of u.rules) if (r.kind === 'price' && readLevel(r) !== null) wanted.add(r.ticker);
    for (const p of positions.get(u.userId) ?? []) wanted.add(p.ticker);
  }
  const quotes = await fetchPrices(run, askedSymbols(run, wanted, MAX_QUOTE_SYMBOLS));

  for (const u of run.users) {
    const prev = run.prevFor(u.userId);
    for (const r of u.rules) {
      if (r.kind !== 'price') continue;
      const level = readLevel(r);
      const price = quotes[r.ticker];
      if (level === null || price === undefined) continue;
      const stored = prev[priceRuleKey(r.ticker, r.condition, level)];
      collect(run, u.userId, r.notifyBy.push, evaluatePriceRule(r, price, stored, run.today));
    }
    const held = positions.get(u.userId) ?? [];
    collect(run, u.userId, true, evaluateThresholds(held, u.thresholds, quotes, prev, run.today));
  }
  return null;
}

/**
 * Positions for the threshold rules: one fold per user over every portfolio,
 * so "from entry" is the same average cost the portfolio screen prints.
 */
async function loadPositions(run: Run): Promise<Map<string, HeldPosition[]> | Failure> {
  const positions = new Map<string, HeldPosition[]>();
  const thresholdUsers = run.users.filter((u) => u.thresholds.up !== null || u.thresholds.down !== null);
  if (thresholdUsers.length === 0) return positions;

  const txRows = await run.db
    .from('transactions')
    .select('user_id,ticker,side,shares,price,trade_date')
    .in(
      'user_id',
      thresholdUsers.map((u) => u.userId),
    );
  if (txRows.error) return dbFailure('transactions', txRows.error.message);

  const byUser = new Map<string, ManualTransaction[]>();
  for (const row of (txRows.data ?? []) as TransactionRow[]) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({
      id: '',
      side: row.side,
      ticker: row.ticker,
      shares: Number(row.shares),
      price: Number(row.price),
      date: row.trade_date,
    });
    byUser.set(row.user_id, list);
  }
  for (const [userId, txs] of byUser) {
    positions.set(
      userId,
      buildPositions(txs)
        .filter((p) => p.shares > 0)
        .map((p) => ({ ticker: p.ticker, shares: p.shares, avgCost: p.avgCost })),
    );
  }
  return positions;
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
    const prev = run.prevFor(u.userId);
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
    const prev = run.prevFor(u.userId);
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

// ── Persist ──────────────────────────────────────────────────────────────

function outcomeKey(o: { userId: string; firing: { dedupeKey: string } }): string {
  return `${o.userId}|${o.firing.dedupeKey}`;
}

/**
 * Write what fired, then what to remember. Notifications first: if that
 * write fails the states are left as they were, so the next run sees the
 * same crossing and tries again — and the dedupe key makes the retry a
 * no-op once a row exists. Returns the firings that became NEW rows, which
 * are the only ones worth a push.
 */
async function persist(run: Run): Promise<{ inserted: Set<string> } | Failure> {
  let inserted = new Set<string>();
  if (run.outcomes.length > 0) {
    const rows = run.outcomes.map((o) => ({
      user_id: o.userId,
      kind: o.firing.kind,
      ticker: o.firing.ticker,
      title_en: o.firing.title.en,
      title_he: o.firing.title.he,
      detail_en: o.firing.detail.en,
      detail_he: o.firing.detail.he,
      dedupe_key: o.firing.dedupeKey,
    }));
    const write = await run.db
      .from('notifications')
      .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
      .select('user_id,dedupe_key');
    if (write.error) return dbFailure('notifications', write.error.message);
    inserted = new Set(
      ((write.data ?? []) as Array<{ user_id: string; dedupe_key: string }>).map(
        (r) => `${r.user_id}|${r.dedupe_key}`,
      ),
    );
  }
  if (run.states.length > 0) {
    const stamp = run.now.toISOString();
    const write = await run.db.from('alert_states').upsert(
      run.states.map((s) => ({ user_id: s.userId, key: s.key, state: s.state, updated_at: stamp })),
      { onConflict: 'user_id,key' },
    );
    if (write.error) return dbFailure('alert_states', write.error.message);
  }
  return { inserted };
}

// ── Push ─────────────────────────────────────────────────────────────────

/**
 * Send each firing to every device its user subscribed. Skipped, and said
 * so, when the VAPID keys are not configured — the notification centre
 * still has the rows, so nothing is lost, only the banner.
 *
 * A push service answering 404 or 410 means the subscription is gone (the
 * user revoked permission, or reinstalled); its row is deleted so the next
 * run does not try again. Any other failure is counted and left alone: a
 * transient error is not a reason to forget a device.
 */
async function deliverPush(
  db: SupabaseClient,
  outcomes: Outcome[],
): Promise<{
  push: 'sent' | 'not_configured' | 'nothing_to_send';
  pushed: number;
  pushFailed: number;
  pushDropped: number;
}> {
  const nothing = { pushed: 0, pushFailed: 0, pushDropped: 0 };
  if (outcomes.length === 0) return { push: 'nothing_to_send', ...nothing };
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn('/api/alerts-run: VAPID keys are not set — recorded without push');
    return { push: 'not_configured', ...nothing };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const userIds = [...new Set(outcomes.map((o) => o.userId))];
  const subs = await db
    .from('push_subscriptions')
    .select('id,user_id,endpoint,p256dh,auth,lang')
    .in('user_id', userIds);
  if (subs.error) {
    console.error(`/api/alerts-run: push_subscriptions query failed: ${subs.error.message}`);
    return { push: 'sent', pushed: 0, pushFailed: outcomes.length, pushDropped: 0 };
  }
  const byUser = new Map<string, PushRow[]>();
  for (const row of (subs.data ?? []) as PushRow[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }

  const jobs: Array<{ sub: PushRow; payload: string }> = [];
  for (const o of outcomes) {
    for (const sub of byUser.get(o.userId) ?? []) {
      const lang = sub.lang === 'en' ? 'en' : 'he';
      jobs.push({ sub, payload: JSON.stringify(pushPayload(o.firing, lang)) });
    }
  }
  let pushed = 0;
  let failed = 0;
  const dead = new Set<string>();
  await inBatches(jobs, async ({ sub, payload }) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS },
      );
      pushed += 1;
    } catch (err) {
      const status = (err as { statusCode?: unknown }).statusCode;
      if (status === 404 || status === 410) dead.add(sub.id);
      else failed += 1;
    }
  });
  if (dead.size > 0) {
    const del = await db
      .from('push_subscriptions')
      .delete()
      .in('id', [...dead]);
    if (del.error) console.error(`/api/alerts-run: could not drop dead subscriptions: ${del.error.message}`);
  }
  return { push: 'sent', pushed, pushFailed: failed, pushDropped: dead.size };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
