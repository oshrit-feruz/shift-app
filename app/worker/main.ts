import { createServer } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isoDayUtc } from '../api/_lib/alerts.js';
import {
  deliverPush,
  hasPriceRules,
  loadPositions,
  loadStates,
  loadUsers,
  outcomeKey,
  persistOutcomes,
  PRICE_WORKER,
  writeHeartbeat,
  type StateMap,
} from '../api/_lib/alertStore.js';
import {
  Coalescer,
  EMPTY_SNAPSHOT,
  evaluateTick,
  planSubscriptions,
  wantedSymbols,
  type Snapshot,
} from './engine.js';
import { Feed, US_TRADES_URL } from './feed.js';

/**
 * The price worker: one process, one socket, every trade.
 *
 * The scheduled route (api/alerts-run.ts) checks price rules every few
 * minutes from Finnhub's quote. This process checks them on every trade
 * from EODHD's US feed instead, which turns "within a few minutes, during
 * regular hours" into "within a second, 04:00–20:00 New York time". It
 * cannot run on Vercel — a function lives seconds, a socket has to live all
 * day — so it runs on a small always-on machine (worker/README.md).
 *
 * It decides nothing of its own. The rules, the memory, the rows and the
 * push are the same code the route uses (api/_lib/alerts.ts,
 * api/_lib/alertStore.ts); this file wires a socket to them and keeps a
 * heartbeat, which is how the route knows to stand down while this is up
 * and to take over when it is not.
 *
 * Three loops, on timers:
 *   refresh   — every minute: re-read the rules, positions and memory, and
 *               reconcile the socket's subscriptions to what they need.
 *   evaluate  — a few times a second: hand the newest price of each symbol
 *               that traded to the engine, at most once a second a symbol.
 *   heartbeat — every half minute while the socket is authorised.
 *
 * Environment: EODHD_API_KEY, SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY; VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT for push; PORT for the health endpoint (default 8080).
 */

const REFRESH_MS = 60_000;
const HEARTBEAT_MS = 30_000;
const EVALUATE_EVERY_MS = 250;
const PER_SYMBOL_MS = 1_000;
/** EODHD's default per-connection limit. */
const MAX_SYMBOLS = 50;
/** A refresh older than this means the rules on the socket may be stale: the health check goes red. */
const REFRESH_STALE_MS = 3 * 60_000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : undefined;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

interface Counters {
  trades: number;
  evaluated: number;
  fired: number;
  recorded: number;
  pushed: number;
  pushFailed: number;
  storeFailures: number;
}

class Worker {
  private snapshot: Snapshot = EMPTY_SNAPSHOT;
  private states: StateMap = new Map();
  private readonly coalescer = new Coalescer(PER_SYMBOL_MS);
  private lastRefreshAt: number | null = null;
  private lastRefreshError: string | null = null;
  private skipped: string[] = [];
  private evaluating = false;
  readonly counters: Counters = {
    trades: 0,
    evaluated: 0,
    fired: 0,
    recorded: 0,
    pushed: 0,
    pushFailed: 0,
    storeFailures: 0,
  };

  constructor(
    private readonly db: SupabaseClient,
    readonly feed: Feed,
  ) {
    feed.on('open', () => log('socket.open'));
    feed.on('status', (s) => log('socket.status', s));
    feed.on('close', (c) => log('socket.close', c));
    feed.on('error', (e) => log('socket.error', { message: e.message }));
    feed.on('trade', (t) => {
      this.counters.trades += 1;
      this.coalescer.offer(t.symbol, t.price);
    });
  }

  /** Re-read the rules and reconcile the socket to them. */
  async refresh(): Promise<void> {
    const users = await loadUsers(this.db, hasPriceRules);
    if (!users.ok) return this.refreshFailed(users.failure.table, users.failure.detail);
    const ids = users.value.map((u) => u.userId);
    const thresholdIds = users.value
      .filter((u) => u.thresholds.up !== null || u.thresholds.down !== null)
      .map((u) => u.userId);
    const [positions, states] = await Promise.all([
      loadPositions(this.db, thresholdIds),
      loadStates(this.db, ids),
    ]);
    if (!positions.ok) return this.refreshFailed(positions.failure.table, positions.failure.detail);
    if (!states.ok) return this.refreshFailed(states.failure.table, states.failure.detail);

    this.snapshot = { users: users.value, positions: positions.value };
    this.states = states.value;
    this.lastRefreshAt = Date.now();
    this.lastRefreshError = null;

    const plan = planSubscriptions(this.feed.symbols, wantedSymbols(this.snapshot), MAX_SYMBOLS);
    this.feed.unsubscribe(plan.unsubscribe);
    this.feed.subscribe(plan.subscribe);
    this.skipped = plan.skipped;
    if (plan.subscribe.length > 0 || plan.unsubscribe.length > 0 || plan.skipped.length > 0) {
      log('subscriptions', {
        users: users.value.length,
        watching: this.feed.symbols.size,
        added: plan.subscribe,
        removed: plan.unsubscribe,
        skipped: plan.skipped,
      });
    }
  }

  private refreshFailed(table: string, detail: string): void {
    this.lastRefreshError = `${table}: ${detail}`;
    this.counters.storeFailures += 1;
    log('refresh.failed', { table, detail });
  }

  /** Hand every symbol whose turn it is to the engine, and write what came out. */
  async evaluate(): Promise<void> {
    // One at a time: a slow database write must not let the next tick
    // evaluate against memory the previous one has not finished updating.
    if (this.evaluating) return;
    const due = this.coalescer.due(Date.now());
    if (due.length === 0) return;
    this.evaluating = true;
    try {
      const now = new Date();
      const today = isoDayUtc(now);
      for (const { symbol, price } of due) {
        const result = evaluateTick(this.snapshot, this.states, symbol, price, today);
        this.counters.evaluated += 1;
        if (result.outcomes.length === 0 && result.states.length === 0) continue;
        this.counters.fired += result.outcomes.length;
        const written = await persistOutcomes(this.db, result.outcomes, result.states, now);
        if (!written.ok) {
          this.counters.storeFailures += 1;
          log('persist.failed', { ...written.failure });
          continue;
        }
        this.counters.recorded += written.value.size;
        const toPush = result.outcomes.filter((o) => o.push && written.value.has(outcomeKey(o)));
        if (toPush.length > 0) {
          const report = await deliverPush(this.db, toPush);
          this.counters.pushed += report.pushed;
          this.counters.pushFailed += report.pushFailed;
          log('fired', {
            symbol,
            price,
            fired: result.outcomes.length,
            recorded: written.value.size,
            ...report,
          });
        } else if (result.outcomes.length > 0) {
          log('fired', { symbol, price, fired: result.outcomes.length, recorded: written.value.size });
        }
      }
    } finally {
      this.evaluating = false;
    }
  }

  /** What the health endpoint and the heartbeat both report. */
  status(now: number = Date.now()) {
    const refreshFresh = this.lastRefreshAt !== null && now - this.lastRefreshAt < REFRESH_STALE_MS;
    return {
      healthy: this.feed.authorized && refreshFresh,
      connected: this.feed.connected,
      authorized: this.feed.authorized,
      symbols: this.feed.symbols.size,
      skipped: this.skipped,
      users: this.snapshot.users.length,
      lastTradeAt: this.feed.lastTradeAt === null ? null : new Date(this.feed.lastTradeAt).toISOString(),
      lastRefreshAt: this.lastRefreshAt === null ? null : new Date(this.lastRefreshAt).toISOString(),
      lastRefreshError: this.lastRefreshError,
      pending: this.coalescer.size,
      ...this.counters,
    };
  }

  /** Tell the route this process is alive — only while the socket really is. */
  async heartbeat(): Promise<void> {
    const status = this.status();
    if (!status.healthy) return;
    const failure = await writeHeartbeat(this.db, PRICE_WORKER, new Date(), status);
    if (failure) {
      this.counters.storeFailures += 1;
      log('heartbeat.failed', { ...failure });
    }
  }
}

function main(): void {
  const apiKey = env('EODHD_API_KEY');
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !url || !serviceKey) {
    console.error('worker: EODHD_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY') || !env('VAPID_SUBJECT')) {
    log('push.not_configured', { note: 'alerts will be recorded in the app without a phone banner' });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const feed = new Feed(`${US_TRADES_URL}?api_token=${encodeURIComponent(apiKey)}`);
  const worker = new Worker(db, feed);

  const port = Number(env('PORT') ?? '8080');
  const server = createServer((req, res) => {
    if (req.url?.split('?')[0] !== '/healthz') {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }
    const status = worker.status();
    res
      .writeHead(status.healthy ? 200 : 503, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      .end(JSON.stringify(status));
  });
  server.listen(port, () => log('http.listening', { port }));

  feed.connect();
  void worker.refresh();
  const refreshTimer = setInterval(() => void worker.refresh(), REFRESH_MS);
  const evaluateTimer = setInterval(() => void worker.evaluate(), EVALUATE_EVERY_MS);
  const heartbeatTimer = setInterval(() => void worker.heartbeat(), HEARTBEAT_MS);

  const shutdown = (signal: string) => {
    log('shutdown', { signal });
    clearInterval(refreshTimer);
    clearInterval(evaluateTimer);
    clearInterval(heartbeatTimer);
    feed.close();
    server.close(() => process.exit(0));
    // A stuck close must not keep a machine the platform is trying to replace.
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
