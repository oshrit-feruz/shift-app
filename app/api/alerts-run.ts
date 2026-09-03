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

    const rawScope = req.query.scope;
    const scope = Array.isArray(rawScope) ? (rawScope.length === 1 ? rawScope[0] : undefined) : rawScope;
    if (!isScope(scope)) {
      return res
        .status(400)
        .json({ error: 'invalid_scope', message: 'Query param "scope" must be prices, news or daily.' });
    }

    // The guard comes before every other configuration check: an
    // unauthenticated caller must learn nothing about how this deployment
    // is set up, not even that it is missing a key.
    const secret = process.env.ALERTS_CRON_SECRET;
    if (!secret) {
      console.error('/api/alerts-run: ALERTS_CRON_SECRET is not set');
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'The alert engine is not configured.' });
    }
    const token = readBearerToken(req);
    if (!token || !secretMatches(token, secret)) {
      return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid bearer token.' });
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error('/api/alerts-run: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set');
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'The alert engine is not configured.' });
    }
    const providerKey = {
      prices: process.env.FINNHUB_API_KEY,
      news: process.env.EODHD_API_KEY,
      daily: process.env.ALPHAVANTAGE_API_KEY,
    }[scope];
    if (!providerKey) {
      console.error(`/api/alerts-run: the ${scope} provider key is not set`);
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'The alert engine is not configured.' });
    }

    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchImpl },
    });
    const now = clock();
    const today = isoDayUtc(now);

    // ── 1. Whose rules this scope concerns ───────────────────────────────
    const stateRows = await db.from('user_state').select('user_id,state');
    if (stateRows.error) return dbFailure(res, 'user_state', stateRows.error.message);
    const users = ((stateRows.data ?? []) as StateRow[])
      .map((r) => ({ userId: r.user_id, rules: readRules(r.state), thresholds: readThresholds(r.state) }))
      .filter((u) => concerns(scope, u));
    if (users.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ scope, today, users: 0, fired: 0, pushed: 0 });
    }
    const userIds = users.map((u) => u.userId);

    // ── 2. What the engine remembered from last time ─────────────────────
    const stateReads = await db.from('alert_states').select('user_id,key,state').in('user_id', userIds);
    if (stateReads.error) return dbFailure(res, 'alert_states', stateReads.error.message);
    const remembered = new Map<string, Record<string, string>>();
    for (const row of (stateReads.data ?? []) as AlertStateRow[]) {
      const bag = remembered.get(row.user_id) ?? {};
      bag[row.key] = row.state;
      remembered.set(row.user_id, bag);
    }
    const prevFor = (userId: string) => remembered.get(userId) ?? {};

    // ── 3. Gather inputs and evaluate ────────────────────────────────────
    const outcomes: Outcome[] = [];
    const states: Array<StateWrite & { userId: string }> = [];
    const collect = (userId: string, push: boolean, ev: { firings: Firing[]; states: StateWrite[] }) => {
      for (const firing of ev.firings) outcomes.push({ userId, firing, push });
      for (const s of ev.states) states.push({ userId, ...s });
    };
    const upstream: Record<string, number> = {};

    if (scope === 'prices') {
      // Positions for the threshold rules: one fold per user over every
      // portfolio, so "from entry" is the same average cost the portfolio
      // screen prints.
      const thresholdUsers = users.filter((u) => u.thresholds.up !== null || u.thresholds.down !== null);
      const positions = new Map<string, HeldPosition[]>();
      if (thresholdUsers.length > 0) {
        const txRows = await db
          .from('transactions')
          .select('user_id,ticker,side,shares,price,trade_date')
          .in(
            'user_id',
            thresholdUsers.map((u) => u.userId),
          );
        if (txRows.error) return dbFailure(res, 'transactions', txRows.error.message);
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
      }

      const wanted = new Set<string>();
      for (const u of users) {
        for (const r of u.rules) if (r.kind === 'price' && readLevel(r) !== null) wanted.add(r.ticker);
        for (const p of positions.get(u.userId) ?? []) wanted.add(p.ticker);
      }
      const symbols = [...wanted].sort((a, b) => a.localeCompare(b));
      const asked = symbols.slice(0, MAX_QUOTE_SYMBOLS);
      upstream.symbols = asked.length;
      upstream.symbolsSkipped = symbols.length - asked.length;

      const quotes: Record<string, number> = {};
      let failed = 0;
      await inBatches(asked, async (symbol) => {
        const r = await fetchUpstreamJson(
          quoteUrl(symbol, providerKey),
          timeoutMs,
          'quote',
          '/api/alerts-run',
          fetchImpl,
        );
        if (!r.ok) {
          failed += 1;
          return;
        }
        const q = mapQuote(r.body);
        if (q) quotes[symbol] = q.price;
      });
      upstream.quoteFailures = failed;

      for (const u of users) {
        const prev = prevFor(u.userId);
        for (const r of u.rules) {
          if (r.kind !== 'price') continue;
          const level = readLevel(r);
          const price = quotes[r.ticker];
          if (level === null || price === undefined) continue;
          collect(
            u.userId,
            r.notifyBy.push,
            evaluatePriceRule(r, price, prev[priceRuleKey(r.ticker, r.condition, level)], today),
          );
        }
        collect(
          u.userId,
          true,
          evaluateThresholds(positions.get(u.userId) ?? [], u.thresholds, quotes, prev, today),
        );
      }
    }

    if (scope === 'news') {
      const wanted = new Set<string>();
      for (const u of users) for (const r of u.rules) if (r.kind === 'news') wanted.add(r.ticker);
      const symbols = [...wanted].sort((a, b) => a.localeCompare(b));
      const asked = symbols.slice(0, MAX_NEWS_SYMBOLS);
      upstream.symbols = asked.length;
      upstream.symbolsSkipped = symbols.length - asked.length;

      const articles = new Map<string, NewsArticle[]>();
      let failed = 0;
      await inBatches(asked, async (ticker) => {
        const u = new URL(EODHD_NEWS_URL);
        u.searchParams.set('s', resolveSymbol(ticker));
        u.searchParams.set('api_token', providerKey);
        u.searchParams.set('fmt', 'json');
        u.searchParams.set('limit', String(NEWS_ARTICLES));
        const r = await fetchUpstreamJson(u, timeoutMs, 'news', '/api/alerts-run', fetchImpl);
        if (!r.ok || !Array.isArray(r.body)) {
          failed += 1;
          return;
        }
        articles.set(
          ticker,
          r.body.map(mapArticle).filter((a): a is NewsArticle => a !== null),
        );
      });
      upstream.newsFailures = failed;

      for (const u of users) {
        const prev = prevFor(u.userId);
        for (const r of u.rules) {
          if (r.kind !== 'news') continue;
          const list = articles.get(r.ticker);
          // A ticker whose fetch failed is not evaluated: with no list there
          // is no "newest article" to arm on, and arming on "now" would let
          // the coverage of the outage pass unreported.
          if (!list) continue;
          collect(u.userId, r.notifyBy.push, evaluateNewsRule(r, list, prev[newsRuleKey(r)], now));
        }
      }
    }

    if (scope === 'daily') {
      const calendar = await fetchCalendar(providerKey, timeoutMs, fetchImpl);
      if (calendar === null) {
        return res.status(502).json({
          error: 'upstream_error',
          message: 'The earnings calendar could not be read; no earnings reminder was evaluated.',
        });
      }
      upstream.calendarRows = calendar.length;
      for (const u of users) {
        const prev = prevFor(u.userId);
        for (const r of u.rules) {
          if (r.kind !== 'earn') continue;
          collect(
            u.userId,
            r.notifyBy.push,
            evaluateEarningsRule(r, calendar, prev[`earn|${r.ticker}|lands`], today),
          );
        }
      }
    }

    // ── 4. Write what fired, then what to remember ───────────────────────
    // Notifications first. If that write fails the states are left as they
    // were, so the next run sees the same crossing and tries again — and the
    // dedupe key makes the retry a no-op once a row exists.
    let inserted = new Set<string>();
    if (outcomes.length > 0) {
      const rows = outcomes.map((o) => ({
        user_id: o.userId,
        kind: o.firing.kind,
        ticker: o.firing.ticker,
        title_en: o.firing.title.en,
        title_he: o.firing.title.he,
        detail_en: o.firing.detail.en,
        detail_he: o.firing.detail.he,
        dedupe_key: o.firing.dedupeKey,
      }));
      const write = await db
        .from('notifications')
        .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
        .select('user_id,dedupe_key');
      if (write.error) return dbFailure(res, 'notifications', write.error.message);
      inserted = new Set(
        ((write.data ?? []) as Array<{ user_id: string; dedupe_key: string }>).map(
          (r) => `${r.user_id}|${r.dedupe_key}`,
        ),
      );
    }
    if (states.length > 0) {
      const write = await db.from('alert_states').upsert(
        states.map((s) => ({ user_id: s.userId, key: s.key, state: s.state, updated_at: now.toISOString() })),
        { onConflict: 'user_id,key' },
      );
      if (write.error) return dbFailure(res, 'alert_states', write.error.message);
    }

    // ── 5. Push, to the devices that asked ───────────────────────────────
    const toPush = outcomes.filter((o) => o.push && inserted.has(`${o.userId}|${o.firing.dedupeKey}`));
    const push = await deliverPush(db, toPush);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      scope,
      today,
      users: users.length,
      // Firings the engine produced this run, and how many of them were new
      // rows rather than repeats of an event already recorded.
      fired: outcomes.length,
      recorded: inserted.size,
      statesWritten: states.length,
      ...push,
      upstream,
    });
  };
}

function dbFailure(res: ApiResponse, table: string, detail: string) {
  console.error(`/api/alerts-run: ${table} query failed: ${detail}`);
  return res.status(502).json({ error: 'db_error', message: `Could not read or write ${table}.` });
}

/**
 * The market-wide earnings calendar, three months out, or null when it could
 * not be read. Alpha Vantage signals its own errors with HTTP 200 and a JSON
 * body, so a body that parses as JSON is checked for one before the CSV
 * parser sees it — see _lib/alphavantage.ts.
 */
async function fetchCalendar(
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<EarningsRow[] | null> {
  const u = new URL(ALPHAVANTAGE_URL);
  u.searchParams.set('function', 'EARNINGS_CALENDAR');
  u.searchParams.set('horizon', '3month');
  u.searchParams.set('apikey', apiKey);
  const r = await fetchUpstreamJson(u, timeoutMs, 'earnings', '/api/alerts-run', fetchImpl, 'text');
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
      jobs.push({ sub, payload: JSON.stringify(pushPayload(o.firing, sub.lang === 'en' ? 'en' : 'he')) });
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
