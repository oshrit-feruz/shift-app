import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { newId } from '../lib/ids';
import { loading, ok, unavailable, type Loadable } from '../data/types';
import {
  EMPTY_LEDGER,
  classifyError,
  planLegacyImport,
  portfoliosOf,
  applyToSnapshot,
  reconcile,
  transactionsByPortfolio,
  type LedgerOp,
  type LedgerSnapshot,
  type LedgerTransaction,
} from './ledger';
import { readLegacyLedger, useDispatch, type TransactionSide } from './appState';

/**
 * Keeps the holdings ledger in sync with the signed-in user's `portfolios` and
 * `transactions` rows. Mounted once via <RemoteSync/> in App.tsx, beside
 * useRemoteSync().
 *
 * Deliberately far simpler than useRemoteSync, and state/ledger.ts explains
 * why: rows here are immutable, so operations commute and the reconciled view
 * is a set computation. That removes the debounce, the upload dedupe, the
 * in-flight interlock and the "server wins wholesale" rule wholesale. What
 * remains is a queue, a read, and the two listeners that matter.
 *
 * ── The outbox ─────────────────────────────────────────────────────────
 *
 * Every mutation is written to `shift.outbox.<userId>` first and sent second.
 * Not an optimisation: today an add is a reducer dispatch and cannot fail, and
 * making it a bare network insert would hand a user on the train an error
 * toast for a transaction they correctly recorded. This app's rule is that the
 * on-device cache keeps working when the network does not, and someone's own
 * ledger is the last place to break it.
 *
 * Per-user, and deliberately NOT in PERSISTED — that bag uploads into account
 * state, and a device's unsent queue is not something to hand another device.
 */

const OUTBOX_PREFIX = 'shift.outbox.';
/**
 * The last server snapshot this device read, per user.
 *
 * The rest of the app already keeps an on-device cache and keeps working when
 * the network does not (appState's localStorage effect); the ledger needs the
 * same, and needs it more. Without it, a reload with no connection left the
 * outbox holding a transaction whose portfolio was only ever known from a read
 * that had not happened yet — so the screen had no portfolio to show it in and
 * said the ledger was unavailable, hiding a row the user had just entered.
 *
 * Separate from the outbox because they answer different questions: this is
 * what the server last said, that is what we still have to tell it.
 */
const CACHE_PREFIX = 'shift.ledger.';

export interface LedgerApi {
  /** The server read. 'unavailable' while the tables or the network are not
   *  there; the rows on screen still include everything queued locally. */
  status: Loadable<LedgerSnapshot>['status'];
  /** Why the read failed, when it did — the migration not being applied yet
   *  reads very differently from a dropped connection, and a reader who is
   *  told which one can tell whether waiting will help. */
  reason: { en: string; he: string } | null;
  addPortfolio: (name: string) => void;
  removePortfolio: (id: string) => void;
  addTransaction: (
    portfolioId: string,
    tx: { side: TransactionSide; ticker: string; shares: number; price: number; date: string },
  ) => void;
  removeTransaction: (portfolioId: string, id: string) => void;
  /**
   * Correct a transaction already recorded, as one queued pair: the old row
   * deleted and a new one inserted.
   *
   * Not an update, because there is no update anywhere — the client has none,
   * and 0005_ledger.sql grants the table no update policy at all. That is the
   * design rather than an omission (see state/ledger.ts): immutable rows are
   * what make reconcile() a set computation and give the outbox its
   * concurrency argument. An edit expressed as delete-plus-insert keeps every
   * bit of that, and the pair is queued in ONE write so the row never blinks
   * out of the list between the two halves.
   */
  replaceTransaction: (
    portfolioId: string,
    id: string,
    tx: { side: TransactionSide; ticker: string; shares: number; price: number; date: string },
  ) => void;
  /** Ops the server refused permanently. Surfaced rather than swallowed: a
   *  queued write that can never succeed and quietly disappears is the same
   *  silent loss the jsonb bag was losing transactions to. */
  rejected: LedgerOp[];
}

const NOOP: LedgerApi = {
  status: 'loading',
  reason: null,
  addPortfolio: () => {},
  removePortfolio: () => {},
  addTransaction: () => {},
  removeTransaction: () => {},
  replaceTransaction: () => {},
  rejected: [],
};

const LedgerCtx = createContext<LedgerApi>(NOOP);

export const useLedger = () => useContext(LedgerCtx);

export function LedgerProvider({ children }: { children: ReactNode }) {
  return <LedgerCtx.Provider value={useLedgerSync()}>{children}</LedgerCtx.Provider>;
}

function useLedgerSync(): LedgerApi {
  const { session } = useAuth();
  const dispatch = useDispatch();
  const userId = session.status === 'ok' && session.data ? session.data.user.id : null;

  const [state, setState] = useState<Loadable<LedgerSnapshot>>(loading());
  const [rejected, setRejected] = useState<LedgerOp[]>([]);
  // The last server snapshot, kept out of React state so the flush loop can
  // read it without re-arming itself on every render.
  const serverRef = useRef<LedgerSnapshot>(EMPTY_LEDGER);
  const outboxRef = useRef<LedgerOp[]>([]);
  // Whether the legacy jsonb has been offered to the ledger this session.
  // Not a persisted flag on purpose — planLegacyImport is idempotent by
  // construction, so running it once per session is free, and a flag that
  // needed syncing would be one more thing to get wrong.
  const importedFor = useRef<string | null>(null);
  const flushing = useRef(false);

  // Push the reconciled view into the reducer, which is what the screens read.
  const publish = useCallback(() => {
    if (!userId) return;
    const view = reconcile(serverRef.current, outboxRef.current, userId);
    dispatch({
      type: 'ledgerLoaded',
      portfolios: portfoliosOf(view),
      transactions: transactionsByPortfolio(view),
    });
  }, [dispatch, userId]);

  const saveOutbox = useCallback(
    (ops: LedgerOp[]) => {
      outboxRef.current = ops;
      if (!userId) return;
      try {
        localStorage.setItem(OUTBOX_PREFIX + userId, JSON.stringify(ops));
      } catch {
        // No storage. The queue still holds for this session and still
        // flushes; it just will not survive a reload. Better than refusing
        // the edit.
      }
    },
    [userId],
  );

  /**
   * Send what is queued, oldest first.
   *
   * FIFO is not cosmetic: an insertPortfolio has to land before the
   * insertTransaction that references it, or the second is refused with a
   * foreign-key violation and marked permanently failed. Stopping at the first
   * retryable failure preserves that order — draining past it would send a
   * transaction whose portfolio is still queued behind it.
   */
  const flush = useCallback(async () => {
    if (!userId || !supabase || flushing.current) return;
    if (outboxRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (outboxRef.current.length > 0) {
        const op = outboxRef.current[0];
        if (op.userId !== userId) {
          // Left behind by another account on a shared device. Dropping it is
          // right: it can never be sent under this identity, and RLS would
          // refuse it anyway.
          saveOutbox(outboxRef.current.slice(1));
          continue;
        }
        const outcome = classifyError(await send(op));
        if (outcome === 'retry') break;
        if (outcome === 'failed') setRejected((prev) => [...prev, op]);
        // A confirmed op IS a server row now, so it moves into the snapshot as
        // it leaves the queue. Without this the two would be briefly empty at
        // once — the op gone from the outbox and the snapshot not yet
        // re-read — and reconcile() would correctly report that the user has
        // nothing, which is how a freshly created portfolio vanished the
        // moment its insert succeeded. Cheaper than a re-read, and it is the
        // same answer the re-read would give.
        if (outcome === 'done') {
          serverRef.current = applyToSnapshot(serverRef.current, op);
          writeCache(userId, serverRef.current);
        }
        saveOutbox(outboxRef.current.slice(1));
      }
    } finally {
      flushing.current = false;
      publish();
    }
  }, [userId, saveOutbox, publish]);

  const enqueueMany = useCallback(
    (ops: LedgerOp[]) => {
      // One outbox write and one publish for the whole group. A caller queuing
      // a delete and an insert separately would publish between them, and the
      // screen would render the moment where the row is gone and its
      // replacement has not arrived.
      saveOutbox([...outboxRef.current, ...ops]);
      publish();
      void flush();
    },
    [saveOutbox, publish, flush],
  );

  const enqueue = useCallback((op: LedgerOp) => enqueueMany([op]), [enqueueMany]);

  /**
   * Read the server's rows and adopt them.
   *
   * Adopting can never lose a local edit, which is the whole point of the
   * design: an edit not yet on the server is still in the outbox, and the
   * outbox is re-applied over every snapshot by reconcile(). That is why none
   * of useRemoteSync's guards — pending-write checks, in-flight counters —
   * appear here.
   */
  const read = useCallback(async () => {
    if (!userId || !supabase) return;
    const [pfs, txs] = await Promise.all([
      supabase.from('portfolios').select('id,name,is_default,created_at').eq('user_id', userId),
      supabase
        .from('transactions')
        .select('id,portfolio_id,side,ticker,shares,price,trade_date,created_at')
        .eq('user_id', userId),
    ]);
    if (pfs.error || txs.error) {
      const err = pfs.error ?? txs.error;
      // 42P01 is 0005_ledger.sql not having been run yet. Reported as
      // unavailable, never as an empty ledger — "your portfolio is gone" is
      // the one thing this must never say when it simply could not look.
      setState(unavailable(providerReason(err?.code)));
      return;
    }
    serverRef.current = {
      portfolios: (pfs.data ?? []).map(readPortfolio),
      transactions: (txs.data ?? []).map(readTransaction),
    };
    writeCache(userId, serverRef.current);
    setState(ok(serverRef.current));
    publish();
    void flush();
    void importLegacy();
    // importLegacy is defined below and closes over the same refs; it is
    // deliberately not a dependency, which would make this callback change
    // identity on every render and re-arm the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, publish, flush]);

  /**
   * Offer the old jsonb ledger to the tables, once per session.
   *
   * Idempotent by construction — ids cross over verbatim, so a second run's
   * inserts are duplicate keys, which classifyError reads as success. That is
   * what lets two devices both run it and converge with no "already migrated"
   * flag, which would itself have to sync.
   */
  const importLegacy = useCallback(() => {
    if (!userId || importedFor.current === userId) return;
    importedFor.current = userId;
    const sandbox = serverRef.current.portfolios.find((p) => p.isDefault);
    if (!sandbox) return; // nothing to re-home orphans onto yet; next read.
    let legacy;
    try {
      legacy = readLegacyLedger(JSON.parse(localStorage.getItem('shift.state') ?? '{}'));
    } catch {
      return;
    }
    if (legacy.manualPortfolios.length === 0 && Object.keys(legacy.manualTransactions).length === 0) {
      return;
    }
    const plan = planLegacyImport(legacy, sandbox.id, userId);
    if (plan.rejected.length > 0) {
      console.warn('ledger import skipped rows the new constraints refuse', plan.rejected);
    }
    if (plan.ops.length === 0) return;
    saveOutbox([...outboxRef.current, ...plan.ops]);
    publish();
    void flush();
  }, [userId, saveOutbox, publish, flush]);

  /**
   * Make sure the user has a Sandbox.
   *
   * The signup trigger in 0005_ledger.sql covers new accounts and the
   * migration backfills existing ones, but that file is applied by hand in the
   * SQL editor while the client ships on the Vercel build — so there is a
   * window in which this code is live and the trigger is not. Losing the race
   * gives 23505, which classifyError reads as success, so this and the trigger
   * can both run without coordinating.
   */
  const ensureSandbox = useCallback(() => {
    if (!userId) return;
    if (serverRef.current.portfolios.some((p) => p.isDefault)) return;
    if (outboxRef.current.some((op) => op.kind === 'insertPortfolio' && op.row.isDefault)) return;
    enqueue({
      kind: 'insertPortfolio',
      userId,
      // Matches the id the SQL trigger generates, so the two cannot produce
      // two Sandboxes that merely look alike — one loses on the primary key.
      row: {
        id: `pf-sandbox-${userId}`,
        name: 'Sandbox',
        isDefault: true,
        createdAt: new Date().toISOString(),
      },
    });
  }, [userId, enqueue]);

  // Load the queue for this identity, then read. Both keyed on userId, so a
  // sign-out or an account switch drops the previous user's rows from view
  // before anything of theirs can be rendered under the new name.
  useEffect(() => {
    setRejected([]);
    importedFor.current = null;
    if (!userId) {
      serverRef.current = EMPTY_LEDGER;
      outboxRef.current = [];
      setState(loading());
      dispatch({ type: 'ledgerLoaded', portfolios: [], transactions: {} });
      return;
    }
    // From the cache first, so a device that opens with no network shows the
    // ledger it last saw rather than nothing. The read below replaces it the
    // moment it lands.
    serverRef.current = readCache(userId);
    outboxRef.current = readOutbox(userId);
    setState(loading());
    publish();
    void read();
  }, [userId, dispatch, publish, read]);

  // Once the read has landed, make sure there is somewhere to record a trade.
  useEffect(() => {
    if (state.status === 'ok') ensureSandbox();
  }, [state.status, ensureSandbox]);

  // Foreground and reconnection, same two triggers as useRemoteSync — a device
  // left open all morning is looking at a stale ledger until one of these
  // fires. No guards needed on this side: adopting cannot lose a local edit.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    const onOnline = () => {
      void flush();
      void read();
    };
    const onHide = () => void flush();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onHide);
    };
  }, [read, flush]);

  return useMemo<LedgerApi>(
    () => ({
      status: state.status,
      reason: state.status === 'unavailable' ? (state.reason ?? null) : null,
      rejected,
      addPortfolio: (name) => {
        if (!userId) return;
        enqueue({
          kind: 'insertPortfolio',
          userId,
          row: { id: newId('manual'), name, isDefault: false, createdAt: new Date().toISOString() },
        });
      },
      removePortfolio: (id) => {
        if (!userId) return;
        enqueue({ kind: 'deletePortfolio', userId, id });
      },
      addTransaction: (portfolioId, tx) => {
        if (!userId) return;
        enqueue({
          kind: 'insertTransaction',
          userId,
          row: {
            id: newId('tx'),
            portfolioId,
            side: tx.side,
            ticker: tx.ticker,
            shares: tx.shares,
            price: tx.price,
            tradeDate: tx.date,
            createdAt: new Date().toISOString(),
          },
        });
      },
      removeTransaction: (_portfolioId, id) => {
        if (!userId) return;
        enqueue({ kind: 'deleteTransaction', userId, id });
      },
      replaceTransaction: (portfolioId, id, tx) => {
        if (!userId) return;
        // The replacement is a NEW row with a new id. Reusing the old id would
        // race the queued delete of it — the two ops commute, and the pair
        // could reach the server in the order that removes what it just
        // inserted.
        enqueueMany([
          { kind: 'deleteTransaction', userId, id },
          {
            kind: 'insertTransaction',
            userId,
            row: {
              id: newId('tx'),
              portfolioId,
              side: tx.side,
              ticker: tx.ticker,
              shares: tx.shares,
              price: tx.price,
              tradeDate: tx.date,
              createdAt: new Date().toISOString(),
            },
          },
        ]);
      },
    }),
    [state, rejected, userId, enqueue, enqueueMany],
  );
}

/** One op, as the single statement that carries it. */
async function send(op: LedgerOp): Promise<{ code?: string; message?: string } | null> {
  if (!supabase) return { message: 'no client' };
  try {
    if (op.kind === 'insertPortfolio') {
      const { error } = await supabase.from('portfolios').insert({
        id: op.row.id,
        user_id: op.userId,
        name: op.row.name,
        is_default: op.row.isDefault,
      });
      return error;
    }
    if (op.kind === 'insertTransaction') {
      const { error } = await supabase.from('transactions').insert({
        id: op.row.id,
        user_id: op.userId,
        portfolio_id: op.row.portfolioId,
        side: op.row.side,
        ticker: op.row.ticker,
        shares: op.row.shares,
        price: op.row.price,
        trade_date: op.row.tradeDate,
      });
      return error;
    }
    const table = op.kind === 'deletePortfolio' ? 'portfolios' : 'transactions';
    const { error } = await supabase.from(table).delete().eq('id', op.id);
    return error;
  } catch (err) {
    // A thrown fetch is a transport failure, which classifyError keeps queued.
    return { message: err instanceof Error ? err.message : 'network' };
  }
}

function readCache(userId: string): LedgerSnapshot {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.portfolios) || !Array.isArray(parsed.transactions)) {
      return EMPTY_LEDGER;
    }
    return parsed as LedgerSnapshot;
  } catch {
    return EMPTY_LEDGER;
  }
}

function writeCache(userId: string, snapshot: LedgerSnapshot) {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(snapshot));
  } catch {
    // Best-effort, like every other cache write here. Losing it costs an
    // offline reload its rows, not the rows themselves — those are on the
    // server or in the outbox.
  }
}

function readOutbox(userId: string): LedgerOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_PREFIX + userId);
    const parsed = raw ? JSON.parse(raw) : [];
    // Ops stamped with another identity are dropped on read as well as on
    // flush: they can never be sent under this one.
    return Array.isArray(parsed) ? parsed.filter((op) => op?.userId === userId) : [];
  } catch {
    return [];
  }
}

function readPortfolio(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    isDefault: row.is_default === true,
    createdAt: String(row.created_at ?? ''),
  };
}

/** numeric columns arrive as strings from PostgREST — they are numeric(20,8)
 *  precisely so a cost basis does not drift, and parsing them back is the
 *  boundary where that would be undone if it were done carelessly. */
function readTransaction(row: Record<string, unknown>): LedgerTransaction {
  return {
    id: String(row.id),
    portfolioId: String(row.portfolio_id),
    side: row.side as TransactionSide,
    ticker: String(row.ticker),
    shares: Number(row.shares),
    price: Number(row.price),
    tradeDate: String(row.trade_date),
    createdAt: String(row.created_at ?? ''),
  };
}

/** Why the ledger could not be read, in both languages. */
function providerReason(code: string | undefined): { en: string; he: string } {
  if (code === '42P01') {
    return {
      en: 'The holdings ledger is not set up on the server yet.',
      he: 'פנקס ההחזקות עדיין לא הוגדר בשרת.',
    };
  }
  return {
    en: 'Could not read your portfolios just now.',
    he: 'לא הצלחנו לקרוא את התיקים שלך כרגע.',
  };
}
