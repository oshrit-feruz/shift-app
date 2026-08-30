import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER,
  applyToSnapshot,
  classifyError,
  planLegacyImport,
  portfoliosOf,
  reconcile,
  transactionsByPortfolio,
  validateTx,
  type LedgerOp,
  type LedgerPortfolio,
  type LedgerSnapshot,
  type LedgerTransaction,
} from './ledger';

const ME = 'user-a';
const THEM = 'user-b';

const pf = (id: string, over: Partial<LedgerPortfolio> = {}): LedgerPortfolio => ({
  id,
  name: id,
  isDefault: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const tx = (id: string, portfolioId: string, over: Partial<LedgerTransaction> = {}): LedgerTransaction => ({
  id,
  portfolioId,
  side: 'buy',
  ticker: 'NVDA',
  shares: 10,
  price: 100,
  tradeDate: '2026-08-20',
  createdAt: '2026-08-20T00:00:00.000Z',
  ...over,
});

const server: LedgerSnapshot = {
  portfolios: [pf('sandbox', { isDefault: true })],
  transactions: [tx('t1', 'sandbox')],
};

describe('reconcile', () => {
  it('is the server’s rows when nothing is queued', () => {
    expect(reconcile(server, [], ME)).toEqual(server);
  });

  it('shows a queued insert before the server has it', () => {
    const ops: LedgerOp[] = [{ kind: 'insertTransaction', userId: ME, row: tx('t2', 'sandbox') }];
    const out = reconcile(server, ops, ME);
    expect(out.transactions.map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('hides a queued delete while the server still has it', () => {
    const ops: LedgerOp[] = [{ kind: 'deleteTransaction', userId: ME, id: 't1' }];
    expect(reconcile(server, ops, ME).transactions).toEqual([]);
  });

  it('does not duplicate an insert the server has already stored', () => {
    // The op is still in the outbox because its confirmation has not landed
    // yet — a read in that window must not show the row twice.
    const ops: LedgerOp[] = [{ kind: 'insertTransaction', userId: ME, row: tx('t1', 'sandbox') }];
    expect(reconcile(server, ops, ME).transactions).toHaveLength(1);
  });

  it('takes a deleted portfolio’s transactions with it', () => {
    // Matching the database's `on delete cascade`, so the rows do not linger
    // locally until the next read.
    const snapshot: LedgerSnapshot = {
      portfolios: [pf('sandbox', { isDefault: true }), pf('other')],
      transactions: [tx('t1', 'sandbox'), tx('t2', 'other')],
    };
    const out = reconcile(snapshot, [{ kind: 'deletePortfolio', userId: ME, id: 'other' }], ME);
    expect(out.portfolios.map((x) => x.id)).toEqual(['sandbox']);
    expect(out.transactions.map((x) => x.id)).toEqual(['t1']);
  });

  it('lets a delete beat an insert of the same id', () => {
    // Ids are generated per creation, so the only way both exist is that the
    // user added a row and then removed it before either op landed.
    const ops: LedgerOp[] = [
      { kind: 'insertTransaction', userId: ME, row: tx('t2', 'sandbox') },
      { kind: 'deleteTransaction', userId: ME, id: 't2' },
    ];
    expect(reconcile(server, ops, ME).transactions.map((x) => x.id)).toEqual(['t1']);
  });

  it('refuses ops stamped with another account', () => {
    // A shared device: an outbox left behind by the previous user must not be
    // flushed, or shown, under the next one.
    const ops: LedgerOp[] = [
      { kind: 'insertTransaction', userId: THEM, row: tx('t9', 'sandbox') },
      { kind: 'deleteTransaction', userId: THEM, id: 't1' },
    ];
    expect(reconcile(server, ops, ME)).toEqual(server);
  });
});

// The claim the whole sync design rests on: because rows are immutable and
// reconcile is a set computation, the order operations happen to sit in the
// queue cannot change what the user sees. Asserted rather than assumed.
describe('reconcile is order-independent', () => {
  const snapshot: LedgerSnapshot = {
    portfolios: [pf('sandbox', { isDefault: true }), pf('p2')],
    transactions: [tx('t1', 'sandbox'), tx('t2', 'p2')],
  };
  const ops: LedgerOp[] = [
    { kind: 'insertPortfolio', userId: ME, row: pf('p3') },
    { kind: 'insertTransaction', userId: ME, row: tx('t3', 'p3') },
    { kind: 'insertTransaction', userId: ME, row: tx('t4', 'sandbox') },
    { kind: 'deleteTransaction', userId: ME, id: 't1' },
    { kind: 'deletePortfolio', userId: ME, id: 'p2' },
    { kind: 'insertTransaction', userId: THEM, row: tx('t5', 'sandbox') },
  ];

  it('gives the same result for every permutation of the queue', () => {
    const expected = reconcile(snapshot, ops, ME);
    for (const order of permutations(ops)) {
      expect(reconcile(snapshot, order, ME)).toEqual(expected);
    }
  });

  it('gives the same result when an op is applied twice', () => {
    const once = reconcile(snapshot, ops, ME);
    expect(reconcile(snapshot, [...ops, ...ops], ME)).toEqual(once);
  });
});

/** Every ordering of a small list. 6 ops → 720 orderings, which is fast. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

describe('shapes the screens already take', () => {
  it('groups transactions by portfolio', () => {
    const snapshot: LedgerSnapshot = {
      portfolios: [pf('a'), pf('b')],
      transactions: [tx('t1', 'a'), tx('t2', 'b'), tx('t3', 'a')],
    };
    const grouped = transactionsByPortfolio(snapshot);
    expect(grouped.a.map((x) => x.id)).toEqual(['t1', 't3']);
    expect(grouped.b.map((x) => x.id)).toEqual(['t2']);
    // The trade date, not the row's creation time: the fold sorts on it.
    expect(grouped.a[0].date).toBe('2026-08-20');
  });

  it('omits a portfolio with no transactions rather than giving it an empty list', () => {
    expect(transactionsByPortfolio({ portfolios: [pf('a')], transactions: [] })).toEqual({});
  });

  it('carries portfolios across by id and name', () => {
    expect(portfoliosOf({ portfolios: [pf('a', { name: 'Ideas' })], transactions: [] })).toEqual([
      { id: 'a', name: 'Ideas' },
    ]);
  });

  it('has an empty ledger to start from', () => {
    expect(reconcile(EMPTY_LEDGER, [], ME)).toEqual(EMPTY_LEDGER);
  });
});

describe('validateTx', () => {
  const draft = { side: 'buy' as const, ticker: 'NVDA', shares: '10', price: '182.44', date: '2026-08-20' };
  const TODAY = '2026-08-29';

  it('accepts a sound buy', () => {
    expect(validateTx(draft, 0, TODAY)).toEqual([]);
  });

  it('accepts the ticker shapes the SQL check accepts', () => {
    for (const ticker of ['BRK.B', 'RY-PT', 'A', 'TEVA']) {
      expect(validateTx({ ...draft, ticker }, 0, TODAY)).toEqual([]);
    }
  });

  it('refuses tickers the SQL check would refuse', () => {
    for (const ticker of ['', '.BRK', 'TOOLONGTICKER', 'NV DA']) {
      expect(validateTx({ ...draft, ticker }, 0, TODAY)).toContain('ticker');
    }
  });

  it('refuses zero and negative quantities on a buy', () => {
    expect(validateTx({ ...draft, shares: '0' }, 0, TODAY)).toContain('shares');
    expect(validateTx({ ...draft, shares: '-4' }, 0, TODAY)).toContain('shares');
    expect(validateTx({ ...draft, price: '0' }, 0, TODAY)).toContain('price');
  });

  it('lets a dividend carry no share count, because it is a cash amount', () => {
    expect(validateTx({ ...draft, side: 'div', shares: '0', price: '42' }, 0, TODAY)).toEqual([]);
  });

  it('refuses a trade dated in the future', () => {
    expect(validateTx({ ...draft, date: '2026-09-01' }, 0, TODAY)).toContain('date');
    expect(validateTx({ ...draft, date: TODAY }, 0, TODAY)).toEqual([]);
    expect(validateTx({ ...draft, date: 'yesterday' }, 0, TODAY)).toContain('date');
  });

  // Refusing this at entry is what keeps the fold in lib/positions.ts from
  // ever having to invent an answer for a sale of shares nobody held.
  it('refuses selling more than is held', () => {
    expect(validateTx({ ...draft, side: 'sell', shares: '10' }, 4, TODAY)).toContain('oversell');
    expect(validateTx({ ...draft, side: 'sell', shares: '4' }, 4, TODAY)).toEqual([]);
  });

  it('does not complain twice about one bad field', () => {
    // "shares must be a number" and "you cannot sell 10 of 4" at once is two
    // complaints about the same box.
    const problems = validateTx({ ...draft, side: 'sell', shares: 'abc' }, 4, TODAY);
    expect(problems).toEqual(['shares']);
  });
});

describe('planLegacyImport', () => {
  const NOW = '2026-08-29T12:00:00.000Z';
  const legacyTx = (id: string, over = {}) => ({
    id,
    side: 'buy' as const,
    ticker: 'NVDA',
    shares: 10,
    price: 100,
    date: '2026-08-20',
    ...over,
  });

  it('carries portfolios and transactions across with their ids intact', () => {
    // Ids crossing over verbatim are what make this idempotent: the inserts
    // become no-ops on a second run, so no "already migrated" flag is needed.
    const plan = planLegacyImport(
      {
        manualPortfolios: [{ id: 'manual-1', name: 'Ideas' }],
        manualTransactions: { 'manual-1': [legacyTx('tx-1')] },
      },
      'sandbox',
      ME,
      NOW,
    );
    expect(plan.rejected).toEqual([]);
    expect(plan.ops).toContainEqual({
      kind: 'insertPortfolio',
      userId: ME,
      row: { id: 'manual-1', name: 'Ideas', isDefault: false, createdAt: NOW },
    });
    const inserted = plan.ops.find((op) => op.kind === 'insertTransaction');
    expect(inserted).toMatchObject({ row: { id: 'tx-1', portfolioId: 'manual-1', tradeDate: '2026-08-20' } });
  });

  it('is idempotent — the same input plans the same ops', () => {
    const input = {
      manualPortfolios: [{ id: 'manual-1', name: 'Ideas' }],
      manualTransactions: { 'manual-1': [legacyTx('tx-1')] },
    };
    expect(planLegacyImport(input, 'sandbox', ME, NOW)).toEqual(planLegacyImport(input, 'sandbox', ME, NOW));
  });

  // Anyone who tapped "Add transaction" while sample data was on has rows
  // filed under the demo portfolio's id, and that fixture is now deleted.
  it('re-homes orphans onto the user’s Sandbox rather than dropping them', () => {
    const plan = planLegacyImport(
      { manualPortfolios: [], manualTransactions: { sandbox: [legacyTx('tx-1')] } },
      'pf-sandbox-user-a',
      ME,
      NOW,
    );
    expect(plan.rejected).toEqual([]);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ row: { portfolioId: 'pf-sandbox-user-a' } });
  });

  it('re-homes rows whose portfolio was deleted on another device', () => {
    const plan = planLegacyImport(
      { manualPortfolios: [], manualTransactions: { 'manual-gone': [legacyTx('tx-1')] } },
      'sandbox',
      ME,
      NOW,
    );
    expect(plan.ops[0]).toMatchObject({ row: { portfolioId: 'sandbox' } });
  });

  it('reports a row the new constraints refuse rather than dropping it silently', () => {
    const plan = planLegacyImport(
      {
        manualPortfolios: [],
        manualTransactions: { sandbox: [legacyTx('tx-bad', { ticker: 'not a ticker' }), legacyTx('tx-ok')] },
      },
      'sandbox',
      ME,
      NOW,
    );
    expect(plan.rejected).toEqual([{ id: 'tx-bad', reason: 'ticker' }]);
    expect(plan.ops).toHaveLength(1);
  });

  // A legacy oversell is a fact about what the user recorded, and
  // lib/positions.ts reports it. Refusing to import it would delete the
  // evidence of the mistake the reader needs to see.
  it('imports a legacy oversell instead of refusing it', () => {
    const plan = planLegacyImport(
      {
        manualPortfolios: [],
        manualTransactions: { sandbox: [legacyTx('tx-1', { side: 'sell', shares: 999 })] },
      },
      'sandbox',
      ME,
      NOW,
    );
    expect(plan.rejected).toEqual([]);
    expect(plan.ops).toHaveLength(1);
  });

  it('copes with a bag that has neither key', () => {
    expect(planLegacyImport({} as never, 'sandbox', ME, NOW)).toEqual({ ops: [], rejected: [] });
  });
});

describe('classifyError', () => {
  it('reads no error as done', () => {
    expect(classifyError(null)).toBe('done');
  });

  // The signup trigger, or another device, won the race to create Sandbox.
  it('reads a duplicate key as success, not failure', () => {
    expect(classifyError({ code: '23505' })).toBe('done');
  });

  // 0005_ledger.sql has not been pasted into the SQL editor yet. The op is
  // fine; the table is not there. Keep it.
  it('keeps an op queued when the table does not exist yet', () => {
    expect(classifyError({ code: '42P01' })).toBe('retry');
  });

  it('keeps an op queued on a transport failure with no code', () => {
    expect(classifyError({ message: 'Failed to fetch' })).toBe('retry');
    expect(classifyError({ code: '08006' })).toBe('retry');
    expect(classifyError({ code: '57014' })).toBe('retry');
  });

  it('marks as failed what can never succeed', () => {
    expect(classifyError({ code: '42501' })).toBe('failed'); // RLS refused it
    expect(classifyError({ code: '23514' })).toBe('failed'); // check violation
    expect(classifyError({ code: '23503' })).toBe('failed'); // no such portfolio
    expect(classifyError({ code: '23502' })).toBe('failed'); // null in a not-null column
  });

  // Retrying something hopeless costs a request; dropping something
  // recoverable costs a transaction, and only one of those is the user's data.
  it('keeps an op it does not recognise rather than discarding it', () => {
    expect(classifyError({ code: 'XX000' })).toBe('retry');
  });
});

// The bug this fixes, caught in a browser and pinned here: a confirmed op
// leaves the outbox, and if the server snapshot has not been re-read the two
// are briefly empty at once — so reconcile() correctly reports the user has
// nothing, and a freshly created portfolio vanishes the moment its insert
// succeeds. Folding the confirmed op into the snapshot closes that window.
describe('applyToSnapshot — a confirmed op is a server row now', () => {
  it('adds a confirmed portfolio, so it survives leaving the outbox', () => {
    const op: LedgerOp = { kind: 'insertPortfolio', userId: ME, row: pf('new') };
    const after = applyToSnapshot(EMPTY_LEDGER, op);
    expect(after.portfolios.map((x) => x.id)).toEqual(['new']);
    // And the view still holds once the op is gone from the queue.
    expect(reconcile(after, [], ME).portfolios).toHaveLength(1);
  });

  it('adds a confirmed transaction', () => {
    const after = applyToSnapshot(server, {
      kind: 'insertTransaction',
      userId: ME,
      row: tx('t2', 'sandbox'),
    });
    expect(after.transactions.map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('folds the same op twice without changing anything', () => {
    const op: LedgerOp = { kind: 'insertTransaction', userId: ME, row: tx('t2', 'sandbox') };
    expect(applyToSnapshot(applyToSnapshot(server, op), op)).toEqual(applyToSnapshot(server, op));
  });

  it('removes a confirmed delete', () => {
    const after = applyToSnapshot(server, { kind: 'deleteTransaction', userId: ME, id: 't1' });
    expect(after.transactions).toEqual([]);
  });

  it('cascades a confirmed portfolio delete, as the database does', () => {
    const snapshot: LedgerSnapshot = {
      portfolios: [pf('sandbox', { isDefault: true }), pf('other')],
      transactions: [tx('t1', 'sandbox'), tx('t2', 'other')],
    };
    const after = applyToSnapshot(snapshot, { kind: 'deletePortfolio', userId: ME, id: 'other' });
    expect(after.portfolios.map((x) => x.id)).toEqual(['sandbox']);
    expect(after.transactions.map((x) => x.id)).toEqual(['t1']);
  });

  it('is a no-op for a delete of something that is not there', () => {
    expect(applyToSnapshot(server, { kind: 'deleteTransaction', userId: ME, id: 'nope' })).toEqual(server);
  });
});
