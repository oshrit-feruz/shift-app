import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { buildPositions } from '../../src/lib/positions.js';
import type { ManualTransaction } from '../../src/lib/transaction.js';
import {
  pushPayload,
  readRules,
  readThresholds,
  type AlertRule,
  type Firing,
  type HeldPosition,
  type StateWrite,
} from './alerts.js';

/**
 * Everything the alert engine reads from and writes to Supabase, in one
 * place, because two processes do it: the scheduled route
 * (api/alerts-run.ts) and the always-on price worker (worker/main.ts).
 * Both read the same rules, remember through the same `alert_states`,
 * write the same `notifications` rows and push through the same
 * subscriptions — so they share this file rather than two copies that
 * would drift, which for "did this alert already fire" is the one place
 * drift would be visible to a user as a duplicate banner.
 *
 * Every read and write goes through the service-role client the caller
 * hands in; nothing here touches the environment.
 */

export interface UserRules {
  userId: string;
  rules: AlertRule[];
  thresholds: { up: number | null; down: number | null };
}

/** A firing with the delivery choice of the rule that produced it. */
export interface Outcome {
  userId: string;
  firing: Firing;
  push: boolean;
}

export type UserState = StateWrite & { userId: string };

/** The engine's memory: per user, state key → the side or mark stored last time. */
export type StateMap = Map<string, Record<string, string>>;

export interface StoreFailure {
  table: string;
  detail: string;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; failure: StoreFailure };

/** Concurrent upstream calls when delivering push. */
const CONCURRENCY = 4;
/** How long a push may wait in the push service for a phone that is off. */
const PUSH_TTL_SECONDS = 3_600;
/** Socket timeout for one delivery, so an unanswered request cannot hold a slot open. */
const PUSH_TIMEOUT_MS = 10_000;

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

function failed<T>(table: string, detail: string): StoreResult<T> {
  return { ok: false, failure: { table, detail } };
}

/**
 * PostgREST caps a response at the project's `max-rows` (1000 by default)
 * and says so nowhere in the payload: a truncated read is a successful read.
 * For this engine that would mean users, transactions, remembered states or
 * devices silently missing from a run — alerts that do not fire, with a
 * 200 and clean counters to say everything was fine. So every list read
 * pages until a short page comes back.
 *
 * Ordered by primary key, without which a row can move between pages as the
 * table changes underneath the walk and be read twice or not at all.
 *
 * A SHORT PAGE IS NOT THE END OF THE TABLE. `db-max-rows` can be set below
 * whatever this asks for, and then every page comes back short — so treating
 * "fewer rows than requested" as "done" would stop at the cap and call it a
 * complete read, which is the failure this function exists to prevent, in a
 * new place. Two things decide instead, neither of which assumes the
 * deployment's limit: the next offset is how many rows have ACTUALLY been
 * read, so a capped page simply means smaller steps; and `count` — the total
 * the filter matches, which PostgREST returns in Content-Range — says when
 * every row is in hand. An empty page ends the walk if `count` is missing.
 */
const PAGE_ROWS = 1000;

interface Page {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

async function pageAll<T>(
  table: string,
  page: (from: number, to: number) => PromiseLike<Page>,
): Promise<StoreResult<T[]>> {
  const all: T[] = [];
  for (;;) {
    const got = await page(all.length, all.length + PAGE_ROWS - 1);
    if (got.error) return failed(table, got.error.message);
    const rows = (got.data ?? []) as T[];
    all.push(...rows);
    if (rows.length === 0) return { ok: true, value: all };
    if (got.count !== null && all.length >= got.count) return { ok: true, value: all };
  }
}

/** Run `work` over `items` with a fixed number of workers in flight. */
export async function inBatches<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
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

// ── Reads ────────────────────────────────────────────────────────────────

/** Every user's rules, validated, keeping only those `keep` says concern the caller. */
export async function loadUsers(
  db: SupabaseClient,
  keep: (u: UserRules) => boolean,
): Promise<StoreResult<UserRules[]>> {
  const rows = await pageAll<StateRow>('user_state', (from, to) =>
    db.from('user_state').select('user_id,state', { count: 'exact' }).order('user_id').range(from, to),
  );
  if (!rows.ok) return rows;
  const users = rows.value
    .map((r) => ({ userId: r.user_id, rules: readRules(r.state), thresholds: readThresholds(r.state) }))
    .filter(keep);
  return { ok: true, value: users };
}

/** True for a user with at least one price rule or a Settings threshold. */
export function hasPriceRules(u: UserRules): boolean {
  return u.rules.some((r) => r.kind === 'price') || u.thresholds.up !== null || u.thresholds.down !== null;
}

/** What the engine remembered about these users, keyed by user then state key. */
export async function loadStates(db: SupabaseClient, userIds: string[]): Promise<StoreResult<StateMap>> {
  const states: StateMap = new Map();
  if (userIds.length === 0) return { ok: true, value: states };
  const rows = await pageAll<AlertStateRow>('alert_states', (from, to) =>
    db
      .from('alert_states')
      .select('user_id,key,state', { count: 'exact' })
      .in('user_id', userIds)
      .order('user_id')
      .order('key')
      .range(from, to),
  );
  if (!rows.ok) return rows;
  for (const row of rows.value) {
    const bag = states.get(row.user_id) ?? {};
    bag[row.key] = row.state;
    states.set(row.user_id, bag);
  }
  return { ok: true, value: states };
}

/**
 * Held positions for the threshold rules: one fold per user over every
 * portfolio, so "from entry" is the same average cost the portfolio screen
 * prints. Users with no transactions are simply absent from the map.
 */
export async function loadPositions(
  db: SupabaseClient,
  userIds: string[],
): Promise<StoreResult<Map<string, HeldPosition[]>>> {
  const positions = new Map<string, HeldPosition[]>();
  if (userIds.length === 0) return { ok: true, value: positions };
  const rows = await pageAll<TransactionRow>('transactions', (from, to) =>
    db
      .from('transactions')
      .select('user_id,ticker,side,shares,price,trade_date', { count: 'exact' })
      .in('user_id', userIds)
      .order('id')
      .range(from, to),
  );
  if (!rows.ok) return rows;

  const byUser = new Map<string, ManualTransaction[]>();
  for (const row of rows.value) {
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
  return { ok: true, value: positions };
}

// ── Writes ───────────────────────────────────────────────────────────────

export function outcomeKey(o: { userId: string; firing: { dedupeKey: string } }): string {
  return `${o.userId}|${o.firing.dedupeKey}`;
}

/**
 * Write what fired, then what to remember. Notifications first: if that
 * write fails the states are left as they were, so the next run sees the
 * same crossing and tries again — and the dedupe key makes the retry a
 * no-op once a row exists. Returns the keys of the firings that became NEW
 * rows, which are the only ones worth a push.
 *
 * A FAILURE STILL CARRIES `inserted`. The dangerous order is the middle
 * case: notifications written, states not. The next run re-evaluates the
 * same crossing, but `ignoreDuplicates` means the row it already wrote comes
 * back from `.select()` as nothing, so that run has nothing to push and the
 * banner would be lost for good while the row sits unread in the app. So the
 * caller pushes what this call did insert before reporting the failure.
 */
export type PersistResult =
  { ok: true; value: Set<string> } | { ok: false; failure: StoreFailure; inserted: Set<string> };

export async function persistOutcomes(
  db: SupabaseClient,
  outcomes: Outcome[],
  states: UserState[],
  now: Date,
): Promise<PersistResult> {
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
    if (write.error) {
      return { ok: false, failure: { table: 'notifications', detail: write.error.message }, inserted };
    }
    inserted = new Set(
      ((write.data ?? []) as Array<{ user_id: string; dedupe_key: string }>).map(
        (r) => `${r.user_id}|${r.dedupe_key}`,
      ),
    );
  }
  if (states.length > 0) {
    const stamp = now.toISOString();
    const write = await db.from('alert_states').upsert(
      states.map((s) => ({ user_id: s.userId, key: s.key, state: s.state, updated_at: stamp })),
      { onConflict: 'user_id,key' },
    );
    if (write.error) {
      return { ok: false, failure: { table: 'alert_states', detail: write.error.message }, inserted };
    }
  }
  return { ok: true, value: inserted };
}

export interface PushReport {
  push: 'sent' | 'not_configured' | 'nothing_to_send';
  pushed: number;
  pushFailed: number;
  pushDropped: number;
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
export async function deliverPush(db: SupabaseClient, outcomes: Outcome[]): Promise<PushReport> {
  const nothing = { pushed: 0, pushFailed: 0, pushDropped: 0 };
  if (outcomes.length === 0) return { push: 'nothing_to_send', ...nothing };
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn('alerts: VAPID keys are not set — recorded without push');
    return { push: 'not_configured', ...nothing };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const userIds = [...new Set(outcomes.map((o) => o.userId))];
  const subs = await pageAll<PushRow>('push_subscriptions', (from, to) =>
    db
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,lang', { count: 'exact' })
      .in('user_id', userIds)
      .order('id')
      .range(from, to),
  );
  if (!subs.ok) {
    console.error(`alerts: push_subscriptions query failed: ${subs.failure.detail}`);
    return { push: 'sent', pushed: 0, pushFailed: outcomes.length, pushDropped: 0 };
  }
  const jobs = pushJobs(outcomes, subs.value);
  const results = await inBatches(jobs, sendOne);
  const dead = new Set<string>();
  let pushed = 0;
  let pushFailed = 0;
  results.forEach((r, i) => {
    if (r === 'sent') pushed += 1;
    else if (r === 'dead') dead.add(jobs[i].sub.id);
    else pushFailed += 1;
  });
  if (dead.size > 0) {
    const del = await db
      .from('push_subscriptions')
      .delete()
      .in('id', [...dead]);
    if (del.error) console.error(`alerts: could not drop dead subscriptions: ${del.error.message}`);
  }
  return { push: 'sent', pushed, pushFailed, pushDropped: dead.size };
}

/** One push per (firing, device) pair, in the device's language. */
function pushJobs(outcomes: Outcome[], rows: PushRow[]): Array<{ sub: PushRow; payload: string }> {
  const byUser = new Map<string, PushRow[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  const jobs: Array<{ sub: PushRow; payload: string }> = [];
  for (const o of outcomes) {
    for (const sub of byUser.get(o.userId) ?? []) {
      const lang = sub.lang === 'en' ? 'en' : 'he';
      jobs.push({ sub, payload: JSON.stringify(pushPayload(o.firing, lang)) });
    }
  }
  return jobs;
}

/** Send one push. 'dead' is the push service saying the subscription no longer exists. */
async function sendOne({
  sub,
  payload,
}: {
  sub: PushRow;
  payload: string;
}): Promise<'sent' | 'dead' | 'failed'> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      // A socket that never answers would otherwise hold one of the four
      // delivery slots for as long as the platform allows, and a run that
      // cannot finish delivering is a run that cannot report what it did.
      { TTL: PUSH_TTL_SECONDS, timeout: PUSH_TIMEOUT_MS },
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: unknown }).statusCode;
    return status === 404 || status === 410 ? 'dead' : 'failed';
  }
}

// ── The worker's heartbeat ───────────────────────────────────────────────

/** The row the price worker keeps fresh while its socket is authorised. */
export const PRICE_WORKER = 'prices-ws';

/**
 * How old a heartbeat may be before the worker counts as gone. Comfortably
 * more than the worker's own interval, so one missed write is not a
 * hand-over; comfortably less than the route's schedule, so a dead worker
 * is covered within a run or two.
 */
export const WORKER_STALE_MS = 5 * 60_000;

export async function writeHeartbeat(
  db: SupabaseClient,
  name: string,
  at: Date,
  detail: Record<string, unknown>,
): Promise<StoreFailure | null> {
  const write = await db
    .from('worker_heartbeat')
    .upsert({ name, at: at.toISOString(), detail }, { onConflict: 'name' });
  return write.error ? { table: 'worker_heartbeat', detail: write.error.message } : null;
}

/**
 * What a worker last reported.
 *
 * `uncovered` is the part the route cannot do without: a worker's socket has
 * a symbol ceiling, and the symbols past it are named in its heartbeat. They
 * are watched by nobody unless the route picks them up, so "the worker is
 * alive" is not on its own a reason for the route to stand down.
 */
export interface Heartbeat {
  at: Date;
  uncovered: string[];
}

/** When the named worker last reported, or null when it never has. A missing table reads as never. */
export async function readHeartbeat(db: SupabaseClient, name: string): Promise<Heartbeat | null> {
  const row = await db.from('worker_heartbeat').select('at,detail').eq('name', name).maybeSingle();
  if (row.error || !row.data) return null;
  const data = row.data as { at: string; detail?: unknown };
  const at = new Date(data.at);
  if (Number.isNaN(at.getTime())) return null;
  return { at, uncovered: readUncovered(data.detail) };
}

/** The `skipped` list a worker writes beside its heartbeat; anything unreadable is no claim of coverage. */
function readUncovered(detail: unknown): string[] {
  if (detail === null || typeof detail !== 'object') return [];
  const raw = (detail as { skipped?: unknown }).skipped;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}

/** Whether a heartbeat is recent enough to trust the worker with the prices. */
export function workerAlive(beat: Heartbeat | null, now: Date, staleMs: number = WORKER_STALE_MS): boolean {
  return beat !== null && now.getTime() - beat.at.getTime() < staleMs;
}
