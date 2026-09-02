import type { ManualPortfolio, ManualTransaction, TransactionSide } from './appState';

/**
 * Pure logic for the holdings ledger — the user's own portfolios and the
 * transactions in them, now rows in Supabase rather than keys in the
 * `user_state` jsonb bag. No supabase import on purpose: everything here is
 * unit-testable without a network, and the I/O lives in useLedgerSync.ts.
 * Same split as remoteState.ts / useRemoteSync.ts.
 *
 * ── Why this is so much smaller than useRemoteSync ─────────────────────
 *
 * Ledger rows are IMMUTABLE. There is no update path anywhere — not in the
 * client, and not in the database (0005_ledger.sql grants no update policy on
 * transactions at all). An edit is a delete and a re-add. That single choice
 * is what makes this whole file a set computation:
 *
 *     what the user sees = server rows − queued deletes + queued inserts
 *
 * Operations are therefore commutative and idempotent, and none of the
 * machinery the jsonb sync needs applies here — no debounce, no lastUploaded
 * dedupe, no in-flight interlock, no "server wins wholesale". There is no
 * moment at which adopting a server snapshot can lose a local edit, because an
 * edit not yet on the server is still in the outbox and the outbox is
 * re-applied over every snapshot. That is the entire concurrency argument, and
 * `reconcile` below is it in code.
 *
 * The bag it replaces could not offer that. It shipped wholesale on a 1.5s
 * debounce, so two devices adding a transaction in the same window each
 * uploaded their own copy of everything and the later write won — one
 * transaction gone, silently, with no error anywhere. Survivable for a
 * watchlist; not for someone's cost basis.
 */

export interface LedgerPortfolio {
  id: string;
  name: string;
  /** The Sandbox. Exactly one per user, and it cannot be deleted. */
  isDefault: boolean;
  createdAt: string;
}

export interface LedgerTransaction {
  id: string;
  portfolioId: string;
  side: TransactionSide;
  ticker: string;
  shares: number;
  price: number;
  /** Trade date, YYYY-MM-DD. Not the row's creation date: a back-dated trade
   *  still happened when it happened, and the fold sorts on this. */
  tradeDate: string;
  createdAt: string;
}

export interface LedgerSnapshot {
  portfolios: LedgerPortfolio[];
  transactions: LedgerTransaction[];
}

export const EMPTY_LEDGER: LedgerSnapshot = { portfolios: [], transactions: [] };

/**
 * One queued mutation. Stamped with the user it was made by, so an outbox left
 * behind by a previous account on a shared device cannot be flushed under the
 * next one's credentials — it would be refused by RLS anyway, but a write that
 * is refused server-side has already been attempted, and the ops would sit in
 * the queue retrying forever.
 */
export type LedgerOp =
  | { kind: 'insertPortfolio'; userId: string; row: LedgerPortfolio }
  | { kind: 'deletePortfolio'; userId: string; id: string }
  | { kind: 'insertTransaction'; userId: string; row: LedgerTransaction }
  | {
      kind: 'deleteTransaction';
      userId: string;
      id: string;
      /**
       * For the delete half of a correction: the id of the insert that
       * replaces this row.
       *
       * The pair is atomic in the outbox but not on the wire — flush sends one
       * statement at a time — so without this, an insert the server refuses
       * permanently leaves its partner delete to remove the original, and the
       * trade is gone. `dropDependents` drops the delete instead, which is why
       * the insert is queued FIRST: by the time the delete is reached, its
       * replacement is either on the server or already known to have failed.
       *
       * The mirror case (insert lands, delete refused) leaves both rows, which
       * is a duplicate the user can see and remove — not a loss.
       */
      afterInsert?: string;
    };

/**
 * The queue with every op that depended on a permanently failed one removed.
 *
 * Only one dependency exists today: the delete half of a correction on the
 * insert that replaces it. Written as a function over the queue rather than as
 * a branch inside the flush loop so it can be tested without a network.
 */
export function dropDependents(outbox: LedgerOp[], failed: LedgerOp): LedgerOp[] {
  if (failed.kind !== 'insertTransaction') return outbox;
  return outbox.filter((op) => !(op.kind === 'deleteTransaction' && op.afterInsert === failed.row.id));
}

/**
 * What this device should show: the server's rows, plus what is queued to be
 * added, minus what is queued to be removed.
 *
 * Written as a set computation rather than as ops applied in sequence, which
 * is what makes the result independent of the queue's order — the property
 * ledger.test.ts asserts rather than assumes. A delete beats an insert of the
 * same id for the same reason: ids are generated per creation, so the only way
 * both exist is that the user added a row and then removed it.
 *
 * A queued portfolio delete takes its transactions with it, matching the
 * `on delete cascade` the database will apply when the op lands. Without that,
 * a deleted portfolio's rows would linger locally until the next read.
 */
export function reconcile(server: LedgerSnapshot, outbox: LedgerOp[], userId: string): LedgerSnapshot {
  const mine = outbox.filter((op) => op.userId === userId);
  const deletedPortfolios = new Set(mine.filter((op) => op.kind === 'deletePortfolio').map((op) => op.id));
  const deletedTransactions = new Set(
    mine.filter((op) => op.kind === 'deleteTransaction').map((op) => op.id),
  );

  const portfolios = new Map<string, LedgerPortfolio>();
  for (const row of server.portfolios) portfolios.set(row.id, row);
  for (const op of mine) if (op.kind === 'insertPortfolio') portfolios.set(op.row.id, op.row);

  const transactions = new Map<string, LedgerTransaction>();
  for (const row of server.transactions) transactions.set(row.id, row);
  for (const op of mine) if (op.kind === 'insertTransaction') transactions.set(op.row.id, op.row);

  return {
    portfolios: [...portfolios.values()]
      .filter((row) => !deletedPortfolios.has(row.id))
      .sort(byCreatedAtThenId),
    transactions: [...transactions.values()]
      .filter((row) => !deletedTransactions.has(row.id) && !deletedPortfolios.has(row.portfolioId))
      .sort(byCreatedAtThenId),
  };
}

/**
 * The snapshot with one confirmed op folded in.
 *
 * The same set computation reconcile() does, applied to the server side —
 * which is what makes it safe: a delete removes by id, an insert is keyed by
 * id, so folding the same op twice changes nothing.
 */
export function applyToSnapshot(snapshot: LedgerSnapshot, op: LedgerOp): LedgerSnapshot {
  if (op.kind === 'insertPortfolio') {
    return {
      ...snapshot,
      portfolios: [...snapshot.portfolios.filter((x) => x.id !== op.row.id), op.row],
    };
  }
  if (op.kind === 'insertTransaction') {
    return {
      ...snapshot,
      transactions: [...snapshot.transactions.filter((x) => x.id !== op.row.id), op.row],
    };
  }
  if (op.kind === 'deletePortfolio') {
    return {
      portfolios: snapshot.portfolios.filter((x) => x.id !== op.id),
      // Cascading, as the database does.
      transactions: snapshot.transactions.filter((x) => x.portfolioId !== op.id),
    };
  }
  return { ...snapshot, transactions: snapshot.transactions.filter((x) => x.id !== op.id) };
}

/** Stable order across devices: the id breaks ties so two clients holding the
 *  same rows never disagree about their sequence. */
function byCreatedAtThenId(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Which transactions belong to which portfolio, in the shape the valuation
 *  layer (lib/positions.ts, via lib/holdings.ts) already takes. */
export function transactionsByPortfolio(snapshot: LedgerSnapshot): Record<string, ManualTransaction[]> {
  const out: Record<string, ManualTransaction[]> = {};
  for (const row of snapshot.transactions) {
    (out[row.portfolioId] ??= []).push({
      id: row.id,
      side: row.side,
      ticker: row.ticker,
      shares: row.shares,
      price: row.price,
      date: row.tradeDate,
    });
  }
  return out;
}

/** The ledger's portfolios in the shape the screens already take. */
export function portfoliosOf(snapshot: LedgerSnapshot): ManualPortfolio[] {
  return snapshot.portfolios.map((row) => ({ id: row.id, name: row.name }));
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Deliberately the same rule as the SQL check in 0005_ledger.sql. Uppercase,
 * 1-10 characters, dots and hyphens for class shares and foreign listings
 * (BRK.B, RY-PT). Kept identical on both sides so a row the sheet accepts is
 * never one the database then refuses — a rejection at that point reaches the
 * user as a mysterious failed save of something they were told was fine.
 */
export const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;

/**
 * The rows the oversell check should measure a draft against.
 *
 * Everything in the portfolio when recording a new trade — and everything
 * EXCEPT the row itself when correcting one. The difference is not cosmetic:
 * a position sold out in full, then reopened for editing, is measured against
 * a holding of zero that its own sell created, so the sheet refuses to let
 * anyone fix the price of the very trade being corrected.
 *
 * Filtering rather than reversing the row's effect, because a correction
 * replaces the row outright: what the ledger holds without it is exactly what
 * the replacement will be added to.
 */
export function ledgerWithout(
  transactions: ManualTransaction[],
  excludeId: string | null | undefined,
): ManualTransaction[] {
  return excludeId == null ? transactions : transactions.filter((tx) => tx.id !== excludeId);
}

export type TxProblem = 'ticker' | 'shares' | 'price' | 'date' | 'oversell';

export interface TxDraft {
  side: TransactionSide;
  ticker: string;
  shares: string;
  price: string;
  date: string;
}

/**
 * Whether a drafted transaction can be saved, and what is wrong when it
 * cannot.
 *
 * A pure function rather than checks scattered through the sheet, because
 * this codebase tests logic and not components — and because the oversell
 * rule below is the one that matters. `heldShares` is what the portfolio
 * currently holds of this ticker; refusing a sell larger than that removes
 * oversell at the source, so the fold in lib/positions.ts only ever has to
 * cope with rows logged before this check existed.
 */
export function validateTx(draft: TxDraft, heldShares: number, today: string): TxProblem[] {
  const problems: TxProblem[] = [];
  const ticker = draft.ticker.trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) problems.push('ticker');

  const shares = Number(draft.shares);
  const price = Number(draft.price.replace(/[^0-9.]/g, ''));
  // A dividend can carry no share count — it is a cash amount — but a buy or
  // a sell of nothing is not a transaction.
  const sharesNeeded = draft.side !== 'div';
  if (!Number.isFinite(shares) || shares < 0 || (sharesNeeded && shares <= 0)) problems.push('shares');
  if (!Number.isFinite(price) || price <= 0) problems.push('price');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date > today) problems.push('date');

  // Only when the share count itself is sound: "you cannot sell 10, you hold
  // 4" on top of "shares must be a number" is two complaints about one field.
  if (draft.side === 'sell' && Number.isFinite(shares) && shares > 0 && shares > heldShares) {
    problems.push('oversell');
  }
  return problems;
}

// ── The one-time move out of the jsonb bag ─────────────────────────────

export interface LegacyLedger {
  manualPortfolios: ManualPortfolio[];
  manualTransactions: Record<string, ManualTransaction[]>;
}

export interface LegacyImportPlan {
  ops: LedgerOp[];
  /** Rows the new constraints refuse, with the field that refused them.
   *  Reported rather than dropped: a transaction that silently fails to make
   *  the crossing is exactly the data loss this whole change is about. */
  rejected: Array<{ id: string; reason: TxProblem | 'name' }>;
}

/**
 * Move what is in the jsonb bag into the ledger.
 *
 * Idempotent by construction: ids cross over verbatim, so the inserts are
 * `on conflict do nothing` and two devices can both run this and converge.
 * That is why there is no "already migrated" flag — a flag would itself have
 * to sync, and a sync bug in the thing guarding a one-time migration is how
 * data gets imported twice or never.
 *
 * `sandboxId` is the user's real Sandbox. Transactions filed under the old
 * demo portfolio's id — which anyone who tapped "Add transaction" while sample
 * data was on will have, since that fixture is now deleted — are re-homed onto
 * it rather than dropped. They were recorded deliberately by someone who meant
 * to keep them.
 */
export function planLegacyImport(
  legacy: LegacyLedger,
  sandboxId: string,
  userId: string,
  now = new Date().toISOString(),
): LegacyImportPlan {
  const ops: LedgerOp[] = [];
  const rejected: LegacyImportPlan['rejected'] = [];
  const known = new Set<string>([sandboxId]);

  for (const pf of legacy.manualPortfolios ?? []) {
    const name = (pf.name ?? '').trim();
    if (!pf.id || name.length === 0 || name.length > 60) {
      rejected.push({ id: pf.id ?? '(no id)', reason: 'name' });
      continue;
    }
    known.add(pf.id);
    ops.push({
      kind: 'insertPortfolio',
      userId,
      row: { id: pf.id, name, isDefault: false, createdAt: now },
    });
  }

  for (const [portfolioId, rows] of Object.entries(legacy.manualTransactions ?? {})) {
    // An orphan is any transaction whose portfolio is not among the user's —
    // the retired demo 'sandbox' id is the common case, but a portfolio
    // deleted on another device leaves the same shape behind.
    const target = known.has(portfolioId) ? portfolioId : sandboxId;
    for (const tx of rows ?? []) {
      const problems = validateLegacyTx(tx);
      if (problems.length > 0) {
        rejected.push({ id: tx.id ?? '(no id)', reason: problems[0] });
        continue;
      }
      ops.push({
        kind: 'insertTransaction',
        userId,
        row: {
          id: tx.id,
          portfolioId: target,
          side: tx.side,
          ticker: tx.ticker.trim().toUpperCase(),
          shares: tx.shares,
          price: tx.price,
          tradeDate: tx.date,
          createdAt: now,
        },
      });
    }
  }

  return { ops, rejected };
}

/**
 * The stored row's own check. Deliberately NOT validateTx: that one refuses a
 * sell larger than the holding, which is right at entry and wrong here — a
 * legacy row that oversells is a fact about what the user recorded, and
 * lib/positions.ts already reports it as `oversold` rather than clamping it.
 * Refusing to import it would delete the evidence of the very mistake the
 * reader needs to see.
 */
function validateLegacyTx(tx: ManualTransaction): TxProblem[] {
  const problems: TxProblem[] = [];
  if (!tx?.id || !TICKER_PATTERN.test((tx.ticker ?? '').trim().toUpperCase())) problems.push('ticker');
  if (!Number.isFinite(tx?.shares) || tx.shares < 0) problems.push('shares');
  if (!Number.isFinite(tx?.price) || tx.price < 0) problems.push('price');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx?.date ?? '')) problems.push('date');
  return problems;
}

// ── Failure classification ─────────────────────────────────────────────

/**
 * What to do with an op the server refused.
 *
 *  - 'done'   — it is already true. A duplicate key means this op, or another
 *               device's identical one, has landed; the trigger winning the
 *               race to create Sandbox is the common case. Success, not
 *               failure.
 *  - 'retry'  — a transient condition: no network, a 5xx, or the ledger
 *               tables not existing yet because 0005_ledger.sql has not been
 *               pasted into the SQL editor. Stays queued.
 *  - 'failed' — it can never succeed: RLS refused it, a constraint rejected
 *               it, or it references a portfolio that is not there. Marked
 *               and shown to the user.
 *
 * The third case is the point of having this function at all. An op that can
 * never succeed and quietly disappears from the queue is the same silent data
 * loss the jsonb bag was losing transactions to.
 */
export type OpOutcome = 'done' | 'retry' | 'failed';

export function classifyError(error: { code?: string; message?: string } | null | undefined): OpOutcome {
  if (!error) return 'done';
  const code = error.code ?? '';
  if (code === '23505') return 'done'; // unique_violation — already there
  if (code === '42P01') return 'retry'; // undefined_table — migration not run yet
  if (code === '42501') return 'failed'; // insufficient_privilege — RLS said no
  if (code === '23514') return 'failed'; // check_violation
  if (code === '23503') return 'failed'; // foreign_key_violation
  if (code === '23502') return 'failed'; // not_null_violation
  // No code at all is a transport failure, not a rejection: fetch throws
  // before the server has an opinion. Postgres codes starting 08 (connection)
  // and 53/57 (resource, operator intervention) are the same kind of thing.
  if (!code) return 'retry';
  if (/^(08|53|57)/.test(code)) return 'retry';
  // An unrecognised code is kept rather than discarded. Retrying something
  // hopeless costs a request; dropping something recoverable costs a
  // transaction, and only one of those is the user's data.
  return 'retry';
}
