import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { DonutChart } from '../components/DonutChart';
import { Chip, ChipRail } from '../components/Chip';
import { ListRow, RowValues } from '../components/ListRow';
import { LogoTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { DemoOnly } from '../components/DemoOnly';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { ALLOC_COLORS } from '../components/AllocationBar';
import { useDemoMode } from '../lib/DemoModeProvider';
import { useAppState, useDispatch, type ManualTransaction, type TransactionSide } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useLedger } from '../state/useLedgerSync';
import { demoService } from '../data/demoAdapter';
import { appService } from '../data/appService';
import { useDemoFlag } from '../data/useDemoFlag';
import { loading, ok, unavailable, type Holding, type Loadable } from '../data/types';
import { useLoadable } from '../data/useLoadable';
import { isoDate, money, moneyOrDash, pctOrDash, signalColor, signedCurrency } from '../lib/format';
import { TxSheet } from '../sheets/TxSheet';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { fetchPortfolioHoldings, portfolioList, sumTotals } from '../lib/holdings';
import { fetchPortfolioSeries } from '../data/portfolioHistory';
import { openGain, type PortfolioSeries } from '../lib/portfolioSeries';
import type { ScreenProps } from '../App';

/**
 * The portfolio tab: one chip per account, then the selected account's value,
 * performance, allocation and holdings.
 *
 * The list is the service-reported portfolios plus the user's own manual ones,
 * built through the shared manualPortfolioSummaries() so this screen and the
 * stock page can never describe the same portfolio differently.
 */
export function PortfolioScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  // In the deps so flipping the switch re-reads, and gating the fetch itself:
  // every account this screen used to list was a demo account.
  const demo = useDemoMode();
  // A real connected account outranks the sample-data switch — it is not
  // sample data. appService routes to SnapTrade when the flag is on and to
  // the demo adapter when it is off; both flags sit in the deps so either
  // flip re-reads.
  const live = useDemoFlag('liveAccount');
  const portfolios = useLoadable(() => appService.portfolios(), [demo, live]);
  const [txOpen, setTxOpen] = useState(false);
  // The row being corrected, or null for a new one. Held here rather than in
  // <Transactions/> because the sheet is mounted at this level; the list only
  // says which row was tapped.
  const [editingTx, setEditingTx] = useState<ManualTransaction | null>(null);
  const ledger = useLedger();
  const toast = useToast();
  const removePortfolio = (pf: { id: string; name: string }) => {
    ledger.removePortfolio(pf.id);
    toast(t('pf.deleted', { name: pf.name }));
  };
  const [newPfOpen, setNewPfOpen] = useState(false);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DataState
        state={portfolios.state}
        onRetry={portfolios.retry}
        skeleton={
          <>
            {/* Mirrors the loaded stack section for section. The card heights
                are measured off the rendered screen, not guessed — a skeleton
                that is the wrong height just moves the jump rather than
                removing it. */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Skeleton width={132} height={38} radius={999} />
              <Skeleton width={104} height={38} radius={999} />
            </div>
            <Skeleton height={36} radius="var(--radius-md)" />
            <SkeletonCard height={81} lines={1} />
            <SkeletonCard height={247} lines={4} />
            <SkeletonCard height={229} lines={3} />
            <SkeletonCard height={239} lines={4} />
            <SkeletonCard height={292} lines={5} />
            <SkeletonCard height={147} lines={2} />
          </>
        }
      >
        {(pfs) => {
          const list = portfolioList(demo ? pfs : [], s.manualPortfolios);

          // Real, not hypothetical: with sample data off, a reader who has not
          // created a portfolio of their own has none at all. Guarded before
          // the index below, which would otherwise read list[-1] and throw on
          // the first property access.
          if (list.length === 0) {
            return (
              <NoPortfolios
                newPfOpen={newPfOpen}
                onNew={() => setNewPfOpen(true)}
                onCloseNew={() => setNewPfOpen(false)}
              />
            );
          }

          const pf = list[Math.min(s.pfIndex, list.length - 1)];
          const isAgg = pf.kind === 'aggregate';
          const isManual = pf.kind === 'manual';
          const linked = list.filter((x) => x.kind === 'linked');
          const inAgg = linked.filter((x) => !s.aggExcluded[x.id]);
          const aggTotal = sumTotals(inAgg);
          // No seeded walk over a real account: invented performance under a
          // real total is the one thing this app's data contract forbids.
          // A manual portfolio is that same case — its total is its own
          // positions at live prices — so it is excluded here too.
          const invented = demo && !live && !isManual;
          const drift = (pf.dayPct ?? 0) >= 0 ? 0.5 : 0.16;
          const series = invented ? demoService.series(`pf-${pf.id}`, 70, drift, 2.4) : [];
          const bench = invented ? demoService.series('bench-spy', 70, 0.22, 1.4) : [];
          const holdings = <Holdings pfId={pf.id} />;

          return (
            <>
              <ChipRail>
                {list.map((x, i) => (
                  <Chip
                    key={x.id}
                    big
                    active={i === Math.min(s.pfIndex, list.length - 1)}
                    onClick={() => dispatch({ type: 'pfIndex', index: i })}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 4,
                        flex: 'none',
                        background:
                          x.kind === 'aggregate'
                            ? 'var(--color-accent)'
                            : x.kind === 'linked'
                              ? 'var(--up)'
                              : 'transparent',
                        outline: x.kind === 'manual' ? '1px dashed var(--muted)' : 'none',
                      }}
                    />
                    {x.kind === 'aggregate' ? t('pf.allAccounts') : x.name}
                  </Chip>
                ))}
              </ChipRail>

              <div style={{ display: 'flex', gap: 7 }}>
                {/* Add transaction exists ONLY on the theoretical portfolio — linked
                    accounts are read-only synced (product rule). */}
                {isManual && (
                  <Button
                    style={{ flex: 1, fontSize: 'var(--text-body)', minHeight: 36 }}
                    onClick={() => {
                      // Clearing is not optional: the sheet stays mounted, so
                      // "add" after an edit would otherwise reopen on the row
                      // that was last corrected.
                      setEditingTx(null);
                      setTxOpen(true);
                    }}
                  >
                    ＋ {t('pf.addTx')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  style={{ fontSize: 'var(--text-body)', minHeight: 36 }}
                  onClick={() => setNewPfOpen(true)}
                >
                  ＋ {t('pf.portfolio')}
                </Button>
              </div>

              {/* Source strip */}
              <Card padding="11px 12px" gap={0} row>
                {pf.kind === 'linked' && <LogoTile src={pf.logo} size={28} />}
                {isAgg && (
                  <span style={{ display: 'flex', flex: 'none', marginInlineEnd: 8 }}>
                    {linked.map((l) => (
                      <span
                        key={l.id}
                        style={{
                          marginInlineEnd: -8,
                          borderRadius: 7,
                          boxShadow: '0 0 0 2px var(--color-surface)',
                        }}
                      >
                        <LogoTile src={l.logo} size={26} />
                      </span>
                    ))}
                  </span>
                )}
                {isManual && (
                  <LogoTile src={null} dashed label={pf.name.slice(0, 2).toUpperCase()} size={28} />
                )}
                <span style={{ flex: 1, minWidth: 0, marginInlineStart: 10 }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>
                    {isAgg ? t('pf.allLinked') : isManual ? pf.name : `${pf.broker} ${pf.acct}`}
                  </span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
                    {isAgg
                      ? t('pf.aggDetail')
                      : isManual
                        ? t('pf.manualDetail')
                        : t('pf.synced', { when: pf.syncedAgo?.[language] ?? '' })}
                  </span>
                </span>
                {/* Hidden for the default portfolio, matching the RLS
                    predicate in 0005_ledger.sql (`and not is_default`) rather
                    than the UI merely declining to offer it — so the button a
                    user can see is exactly the one the database will allow.
                    Sandbox is where a trade can always be recorded, so it
                    cannot be deleted out from under that. */}
                {isManual && !isSandbox(pf.id) ? (
                  <Button variant="ghost" fontSize={15.5} onClick={() => removePortfolio(pf)}>
                    {t('pf.delete')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    fontSize={15.5}
                    onClick={() => dispatch({ type: 'go', screen: 'connections' })}
                  >
                    {isAgg || pf.kind === 'linked' ? t('pf.manage') : t('pf.link')}
                  </Button>
                )}
              </Card>

              {isAgg && (
                <Card padding="4px 0" gap={0}>
                  <CardTitle size={17}>
                    <span style={{ padding: '9px 13px 2px', display: 'block' }}>{t('pf.byAccount')}</span>
                  </CardTitle>
                  <div
                    className="text-muted"
                    style={{ fontSize: 'var(--text-caption)', padding: '0 13px 6px' }}
                  >
                    {t('pf.aggPickHelp')}
                  </div>
                  {linked.map((x) => {
                    const on = !s.aggExcluded[x.id];
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => dispatch({ type: 'toggleAggAccount', id: x.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '10px 13px',
                          border: 0,
                          borderTop: '1px solid var(--color-divider)',
                          background: 'transparent',
                          color: 'inherit',
                          font: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'start',
                          opacity: on ? 1 : 0.45,
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            flex: 'none',
                            borderRadius: '50%',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 'var(--text-caption)',
                            ...(on
                              ? { background: 'var(--color-accent)', color: 'var(--g2)' }
                              : { border: '1px solid var(--color-divider)', color: 'transparent' }),
                          }}
                        >
                          ✓
                        </span>
                        <LogoTile src={x.logo} size={26} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{x.name}</span>
                          <span
                            className="text-muted"
                            style={{ display: 'block', fontSize: 'var(--text-caption)' }}
                          >
                            {on ? sharePct(x.total, aggTotal) : t('pf.excluded')}
                          </span>
                        </span>
                        <span style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                          <RowValues
                            main={moneyOrDash(x.total)}
                            sub={pctOrDash(x.dayPct)}
                            subColor={signalColor(x.dayPct)}
                          />
                        </span>
                      </button>
                    );
                  })}
                </Card>
              )}

              <Card padding={14} gap={8}>
                <div className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
                  {isAgg ? t('pf.allAccounts') : pf.name} {t('pf.totalValue')}
                </div>
                {/* A manual portfolio's worth is its own positions valued at
                    live prices, so it is read here rather than taken from the
                    summary row — which has no way to know it. */}
                {isManual ? (
                  <ManualValue pfId={pf.id} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                    <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
                      {moneyOrDash(isAgg ? aggTotal : pf.total)}
                    </Num>
                    <span
                      style={{
                        fontSize: 'var(--text-body)',
                        color: signalColor(pf.dayPct),
                        paddingBottom: 3,
                      }}
                    >
                      <Num>{pctOrDash(pf.dayPct)}</Num> {t('pf.today')}
                    </span>
                  </div>
                )}
                <PerformanceSlot
                  live={live}
                  isManual={isManual}
                  demo={demo}
                  series={series}
                  bench={bench}
                  ledger={s.manualTransactions[pf.id] ?? []}
                  label={isAgg ? t('pf.allAccounts') : pf.name}
                />
              </Card>

              <AllocationCard live={live} demo={demo} pfId={pf.id} beg={beg} />

              <Card padding="13px 13px 4px" gap={4}>
                <CardTitle>{t('pf.holdings')}</CardTitle>
                {holdings}
              </Card>

              {/* The log itself, because there is nowhere else to delete from:
                  the Holdings card lists POSITIONS, each derived from any
                  number of transactions, so a row there has no single record
                  behind it to remove. Manual portfolios only — a linked
                  account's history is the broker's, not ours to edit. */}
              {isManual && (
                <Transactions
                  pfId={pf.id}
                  onEdit={(tx) => {
                    setEditingTx(tx);
                    setTxOpen(true);
                  }}
                />
              )}

              {demo ? <LongTermSavings /> : <DemoOnly feature="pf.longTerm" />}
              <TxSheet
                open={txOpen}
                onClose={() => setTxOpen(false)}
                pfId={pf.id}
                pfName={pf.name}
                editing={editingTx}
              />
              <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
            </>
          );
        }}
      </DataState>
    </div>
  );
}

/**
 * One portfolio's holdings list — the service-reported rows with that
 * portfolio's manual buy/sell log applied on top, so a position the user
 * entered by hand reads the same as a synced one.
 */
function Holdings({ pfId }: Readonly<{ pfId: string }>) {
  const dispatch = useDispatch();
  const t = useT();
  const { state, retry } = usePortfolioHoldings(pfId);

  return (
    <DataState
      state={state}
      onRetry={retry}
      skeleton={<SkeletonList count={4} leading={false} minHeight={46} />}
    >
      {({ rows }) => {
        // Held first, then anything sold out — a closed position is history,
        // and history belongs under what is still open rather than mixed into
        // it where it reads as a live holding of zero shares.
        const held = rows.filter((h) => h.shares > 0);
        const closed = rows.filter((h) => h.shares === 0);
        if (rows.length === 0) return <EmptyState>—</EmptyState>;
        return (
          <>
            {held.map((h) => (
              <HoldingRow
                key={h.ticker}
                h={h}
                onOpen={() => dispatch({ type: 'openStock', ticker: h.ticker })}
              />
            ))}
            {closed.length > 0 && (
              <>
                <div
                  className="text-muted"
                  style={{ fontSize: 'var(--text-caption)', padding: '10px 0 2px' }}
                >
                  {t('pf.closed')}
                </div>
                {closed.map((h) => (
                  <HoldingRow
                    key={h.ticker}
                    h={h}
                    closed
                    onOpen={() => dispatch({ type: 'openStock', ticker: h.ticker })}
                  />
                ))}
              </>
            )}
          </>
        );
      }}
    </DataState>
  );
}

/**
 * One holdings row. `value` and `plPct` are nullable and render as "—": a
 * position in a ticker the price mirror does not cover has no worth we can
 * state, and the old code's green "+0.00%" said it was flat instead.
 */
function HoldingRow({ h, closed, onOpen }: Readonly<{ h: Holding; closed?: boolean; onOpen: () => void }>) {
  const t = useT();
  return (
    <ListRow
      title={h.ticker}
      subtitle={
        closed ? (
          <Num>{t('pf.soldOut')}</Num>
        ) : (
          // Cost sits beside the share count rather than opposite the value,
          // because it belongs to the same half of the row: these two are what
          // the user did, and the figures on the right are what the market did
          // with it. It is also the one number here the market cannot take
          // away — an unpriced holding shows "—" for worth and still says what
          // it cost.
          <Num>{`${h.shares} sh · avg ${money(h.avgCost)} · ${t('pf.costLabel')} ${money(h.costBasis)}`}</Num>
        )
      }
      right={
        <RowValues
          main={closed ? '—' : moneyOrDash(h.value, 0)}
          sub={pctOrDash(h.plPct)}
          subColor={signalColor(h.plPct)}
        />
      }
      minHeight={46}
      onClick={onOpen}
    />
  );
}

/**
 * What goes under a portfolio's total: a chart, or the sentence that says why
 * there isn't one.
 *
 * Four cases that are easy to collapse and must not be. A seeded random walk
 * is only ever allowed under a total that is itself demonstration data —
 * invented performance under a real figure is the one thing this app's data
 * contract forbids — so both a connected account and a manual portfolio are
 * excluded, and each says which fact of its own is missing rather than
 * sharing one vague line.
 *
 * Written as early returns rather than a chain of ternaries because the cases
 * are exclusive and each carries its own reason; a reader should be able to
 * find the one that applies to them without unwinding the others.
 */
function PerformanceSlot({
  live,
  isManual,
  demo,
  series,
  bench,
  ledger,
  label,
}: Readonly<{
  live: boolean;
  isManual: boolean;
  demo: boolean;
  series: number[];
  bench: number[];
  ledger: ManualTransaction[];
  label: string;
}>) {
  const t = useT();

  // isManual is asked FIRST because the two are not the same kind of fact:
  // `live` is a switch on the whole app, while a manual portfolio is a
  // property of the row the user has selected — and a manual portfolio can be
  // open while that switch is on. Asked the other way round, the Sandbox
  // explained itself as a brokerage that reports no priced history, which is
  // not what it is.
  //
  // A manual portfolio is the one case that CAN be drawn honestly: its shares
  // are the user's own rows and its prices are real closes, so the line is
  // computed rather than invented. It is asked first for the same reason as
  // before — `live` is a switch on the whole app, while being manual is a
  // property of the row the user selected, and the two can be true at once.
  if (isManual) return <ManualValueChart ledger={ledger} label={label} />;
  // A live read of a connected account's current state: the brokerage reports
  // no priced history through the integration at all.
  if (live) return <Note>{t('live.noHistory')}</Note>;
  // The line and its benchmark are both seeded walks, so with sample data off
  // there is nothing honest left to draw.
  if (!demo) return <DemoOnly feature="pf.performance" card={false} />;
  return (
    <>
      <AreaChart values={series} height={110} pad={8} compare={bench} />
      <div className="text-muted" style={{ display: 'flex', gap: 14, fontSize: 'var(--text-caption)' }}>
        <span>
          <span style={{ color: 'var(--acc-lite)' }}>—</span> {label}
        </span>
        <span>{t('pf.benchmark')}</span>
      </div>
    </>
  );
}

/**
 * What the screen shows to someone whose portfolio list is empty.
 *
 * An empty list and an unread one are not the same fact, and the difference is
 * the whole reason the ledger reports a status. "You have no portfolios" over
 * a failed read tells someone their holdings are gone; a reload that has not
 * landed, or a migration not yet applied, must say so and offer the retry
 * instead.
 */
function NoPortfolios({
  newPfOpen,
  onNew,
  onCloseNew,
}: Readonly<{ newPfOpen: boolean; onNew: () => void; onCloseNew: () => void }>) {
  const t = useT();
  const ledger = useLedger();

  if (ledger.status !== 'ok') {
    return (
      <DataState state={ledgerState(ledger.status, ledger.reason)} onRetry={() => window.location.reload()}>
        {() => null}
      </DataState>
    );
  }

  return (
    <>
      <DemoOnly feature="connScreen.linked">
        <Button variant="secondary" alignSelf="flex-start" fontSize={16} minHeight={36} onClick={onNew}>
          ＋ {t('pf.portfolio')}
        </Button>
      </DemoOnly>
      <NewPortfolioSheet open={newPfOpen} onClose={onCloseNew} />
    </>
  );
}

/**
 * The allocation card, in the three versions the screen can honestly show.
 *
 * Early returns rather than a chain of conditionals inline in the screen's
 * JSX, because the three are not shades of one card: a live account's own
 * position values, a donut labelled as sample data, and nothing at all are
 * three different claims, and the one that applies should be readable without
 * unwinding the other two.
 */
function AllocationCard({
  live,
  demo,
  pfId,
  beg,
}: Readonly<{ live: boolean; demo: boolean; pfId: string; beg: boolean }>) {
  const t = useT();
  const { language } = useTheme();

  if (live) {
    return (
      <Card padding={14} gap={10}>
        <CardTitle>{t('pf.allocation')}</CardTitle>
        {/* Computed from the account's actual position values — an invented
            allocation over real holdings would misstate the concentration
            this card exists to show. */}
        <LiveAllocation pfId={pfId} />
      </Card>
    );
  }

  if (!demo) return <DemoOnly feature="pf.allocation" />;

  return (
    <Card padding={14} gap={10}>
      <CardTitle>{t('pf.allocation')}</CardTitle>
      <DonutChart
        slices={[
          { label: 'NVDA', pct: 28, colorVar: ALLOC_COLORS[0] },
          { label: 'AMD', pct: 19, colorVar: ALLOC_COLORS[1] },
          { label: 'MSFT', pct: 15, colorVar: ALLOC_COLORS[2] },
          { label: 'AAPL', pct: 13, colorVar: 'var(--acc-pale)' },
          { label: 'LLY', pct: 11, colorVar: 'var(--muted)' },
          { label: language === 'he' ? 'מזומן' : 'Cash', pct: 14, colorVar: 'var(--line)' },
        ]}
      />
      {beg && (
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0 }}>
          {t('pf.concentration')}
        </p>
      )}
    </Card>
  );
}

/**
 * The muted caption every "why there is no chart here" sentence takes.
 *
 * One definition rather than one per card: these lines are the app saying what
 * it does not know, and they would be a strange thing to let drift apart in
 * size or spacing between two cards that sit on the same screen.
 */
function Note({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

/**
 * A manual portfolio's value through time, drawn from the user's own ledger
 * priced at real daily closes.
 *
 * This is the one performance line in the app that is neither a seeded walk
 * nor a brokerage's own figure: the shares come from rows the user typed, the
 * prices from the same provider the stock pages read, and the arithmetic from
 * the same fold the holdings card runs on.
 *
 * Three of its states are deliberately different from one another, because
 * they are different facts and a reader has to be able to tell which one they
 * are looking at:
 *
 *   no trades yet     — nothing to draw, and nothing wrong
 *   no history        — the provider answered, and publishes none for these
 *                       holdings; a real answer about the symbols
 *   unavailable       — every read failed, and the app does not know
 *
 * Only the middle one is a statement about the portfolio.
 */
function ManualValueChart({ ledger, label }: Readonly<{ ledger: ManualTransaction[]; label: string }>) {
  const t = useT();
  const { language } = useTheme();
  // Keyed on the rows themselves rather than on the portfolio id: editing a
  // trade has to redraw the line, and the id does not change when it does.
  const key = ledger
    .map((tx) => `${tx.id}:${tx.side}:${tx.ticker}:${tx.shares}:${tx.price}:${tx.date}`)
    .join('|');
  const { state, retry } = useLoadable<PortfolioSeries>(() => fetchPortfolioSeries(ledger), [key]);

  if (ledger.length === 0) return <Note>{t('pf.valueNoneYet')}</Note>;

  return (
    <DataState state={state} onRetry={retry} skeleton={<Skeleton height={110} />}>
      {(series) => {
        const priced = series.points.filter((p) => p.value !== null);
        // The provider answered and had nothing to say about these symbols —
        // which is a fact about the holdings, not a failure of the read, and
        // the two must not be worded the same way.
        if (priced.length === 0) return <Note>{t('pf.valueNoHistory')}</Note>;

        const gain = openGain(series.points);
        // Two sentences, because Hebrew inflects the verb and not only the noun.
        const gapKey = series.unpriced.length === 1 ? 'pf.valueGapOne' : 'pf.valueGapMany';
        const gap =
          series.unpriced.length === 0 ? null : t(gapKey).replace('{tickers}', series.unpriced.join(', '));

        return (
          <>
            <AreaChart
              values={series.points.map((p) => p.value)}
              height={110}
              pad={8}
              compare={series.points.map((p) => p.cost)}
            />
            <div
              className="text-muted"
              style={{ display: 'flex', gap: 14, fontSize: 'var(--text-caption)', flexWrap: 'wrap' }}
            >
              <span>
                <span style={{ color: 'var(--acc-lite)' }}>—</span> {label}
              </span>
              <span>{t('pf.costLine')}</span>
              {gain && (
                <span style={{ color: signalColor(gain.abs), marginInlineStart: 'auto' }}>
                  {t('pf.openGain')} <Num>{signedCurrency(gain.abs)}</Num>
                  {gain.pct !== null && (
                    <>
                      {' '}
                      (<Num>{pctOrDash(gain.pct)}</Num>)
                    </>
                  )}
                </span>
              )}
            </div>
            <Note>{t('pf.valueBasis')}</Note>
            {gap && <Note>{gap}</Note>}
            {series.ledgerStartsBefore && (
              <Note>
                {t('pf.valueClipped').replace('{date}', isoDate(series.ledgerStartsBefore, language))}
              </Note>
            )}
          </>
        );
      }}
    </DataState>
  );
}

/**
 * A manual portfolio's total, and — when it cannot be stated — which holdings
 * are the reason.
 *
 * Reads through the same function the holdings card does, so the figure here
 * and the rows below it can never disagree about what was priced.
 */
function ManualValue({ pfId }: Readonly<{ pfId: string }>) {
  const t = useT();
  const { state } = usePortfolioHoldings(pfId);
  const valuation = state.status === 'ok' ? state.data.valuation : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
        <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
          {moneyOrDash(valuation?.total ?? null)}
        </Num>
      </div>
      {/* How much they made, in the currency they think in and as a share of
          what they put in. Both come from the same valuation as the total
          above, so the three figures can never disagree: an unpriced holding
          makes all of them "—" together rather than leaving a confident
          profit under an unknown worth. */}
      {valuation && valuation.positions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
            {t('pf.totalReturn')}
          </span>
          <span style={{ fontSize: 'var(--text-row)', color: signalColor(valuation.pl) }}>
            <Num>{valuation.pl === null ? '—' : signedCurrency(valuation.pl)}</Num>{' '}
            <Num>{valuation.plPct === null ? '' : `(${pctOrDash(valuation.plPct)})`}</Num>
          </span>
          {valuation.invested > 0 && (
            <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
              {t('pf.returnBasis', { invested: money(valuation.invested) })}
            </span>
          )}
        </div>
      )}
      {/* Why the total is an em dash, said where the reader is looking when
          they wonder. A silent "—" over a list of real positions reads as a
          broken app; naming what could not be priced is the difference
          between "we don't know" and "something went wrong". */}
      {valuation && valuation.unpriced.length > 0 && (
        <div className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.45 }}>
          {t('pf.partiallyPriced', {
            priced: valuation.priced,
            held: valuation.held,
            tickers: valuation.unpriced.join(', '),
          })}
        </div>
      )}
    </>
  );
}

/**
 * One portfolio's holdings and valuation. Both the total above the chart and
 * the holdings card read through this, which is the point: they used to be
 * computed separately, which is how a confident dollar total could sit above
 * a list of positions the app had just failed to price.
 */
function usePortfolioHoldings(pfId: string) {
  const s = useAppState();
  const demo = useDemoMode();
  const transactions = s.manualTransactions[pfId] ?? [];
  // Keyed on the log's identity, so a transaction added or removed re-values
  // at once rather than after the next visit.
  const key = transactions.map((tx) => tx.id).join(',');
  return useLoadable(() => fetchPortfolioHoldings(pfId, transactions), [pfId, demo, key]);
}

/**
 * The ledger read as something DataState can render.
 *
 * The rows themselves are already in the reducer — this carries only whether
 * the read succeeded, which is all the empty branch above needs to tell "you
 * have none" apart from "we could not look".
 */
function ledgerState(
  status: 'loading' | 'unavailable' | 'ok',
  reason: { en: string; he: string } | null,
): Loadable<null> {
  if (status === 'loading') return loading();
  if (status === 'unavailable') return unavailable(reason ?? undefined);
  return ok(null);
}

/**
 * Allocation computed from a real connected account's actual position values.
 *
 * Only positions the brokerage priced can be weighted. A SHORT is priced but
 * has a negative value, and a ring draws shares of a positive total — so it
 * is excluded and NAMED, because dropping it silently made a two-position
 * account read as "ORCL 100%".
 */
function LiveAllocation({ pfId }: Readonly<{ pfId: string }>) {
  const t = useT();
  const holdings = useLoadable(() => appService.holdings(pfId), [pfId]);

  return (
    <DataState
      state={holdings.state}
      onRetry={holdings.retry}
      skeleton={<Skeleton height={132} radius="var(--radius-md)" />}
    >
      {(rows) => {
        // A null value is a position the brokerage did not price; it is not
        // a zero, and it cannot be given a share of a total either.
        const shorts = rows.filter((r) => r.value !== null && r.value < 0);
        const priced = rows.filter((r) => r.value !== null && r.value > 0);
        const total = priced.reduce((sum, r) => sum + (r.value ?? 0), 0);
        if (total === 0) return <EmptyState>{t('live.noAllocation')}</EmptyState>;
        const palette = [...ALLOC_COLORS, 'var(--acc-pale)', 'var(--muted)', 'var(--line)'];
        const slices = [...priced]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .slice(0, palette.length)
          .map((r, i) => ({ label: r.ticker, pct: ((r.value ?? 0) / total) * 100, colorVar: palette[i] }));
        return (
          <>
            <DonutChart slices={slices} />
            {shorts.length > 0 && (
              <p
                className="text-muted"
                style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}
              >
                {t('live.shortExcluded', { tickers: shorts.map((r) => r.ticker).join(', ') })}
              </p>
            )}
          </>
        );
      }}
    </DataState>
  );
}

/**
 * A portfolio's own transaction log, newest first, each row removable.
 *
 * Transactions are immutable — there is no edit, in the client or in the
 * database (0005_ledger.sql grants no update policy on this table at all). An
 * edit is a delete and a re-add, one extra tap, and that immutability is
 * exactly what makes the sync commutative: operations replay in any order
 * without changing the result.
 */
function Transactions({
  pfId,
  onEdit,
}: {
  readonly pfId: string;
  readonly onEdit: (tx: ManualTransaction) => void;
}) {
  const s = useAppState();
  const t = useT();
  const { language } = useTheme();
  const ledger = useLedger();
  const toast = useToast();
  const rows = s.manualTransactions[pfId] ?? [];

  return (
    <Card padding="13px 13px 4px" gap={4}>
      <CardTitle>{t('tx.transactions')}</CardTitle>
      {rows.length === 0 ? (
        <EmptyState>{t('tx.none')}</EmptyState>
      ) : (
        [...rows].sort(newestFirst).map((tx, i) => (
          <ListRow
            key={tx.id}
            divider={i > 0}
            title={`${t(sideKey(tx.side))} ${tx.ticker}`}
            subtitle={<Num>{`${tx.shares} × ${money(tx.price)} · ${isoDate(tx.date, language)}`}</Num>}
            // The row itself opens the correction, and the button beside it
            // still deletes: fixing a mistyped price should not cost the
            // trade's date and side as well, which is what re-entering it
            // was costing.
            onClick={() => onEdit(tx)}
            ariaLabel={t('tx.editAria', { ticker: tx.ticker })}
            trailing={
              <RowIconButton
                label={t('tx.removeAria', { ticker: tx.ticker })}
                onClick={() => {
                  ledger.removeTransaction(pfId, tx.id);
                  toast(t('tx.removed'));
                }}
              >
                <Icon name="close" size={16} strokeWidth={2} />
              </RowIconButton>
            }
            minHeight={46}
          />
        ))
      )}
    </Card>
  );
}

/** The small square delete button at the end of a transaction row — the same
 *  idiom as the watchlist's, so removing a thing looks the same everywhere. */
function RowIconButton({
  label,
  onClick,
  children,
}: Readonly<{
  label: string;
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      className="row-icon-btn"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-divider)',
        color: 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/**
 * A lookup rather than a chain of tests, so the mapping is total by
 * construction: adding a fourth side becomes a type error here instead of
 * silently falling through to "buy".
 */
const SIDE_KEYS = { buy: 'tx.buy', sell: 'tx.sell', div: 'tx.div' } as const;

function sideKey(side: TransactionSide): (typeof SIDE_KEYS)[TransactionSide] {
  return SIDE_KEYS[side];
}

/**
 * Newest first: the row someone is most likely to have mistyped is the one
 * they just entered, so it belongs at the top of the log.
 */
function newestFirst(a: ManualTransaction, b: ManualTransaction): number {
  if (a.date > b.date) return -1;
  if (a.date < b.date) return 1;
  return 0;
}

/**
 * Whether this is the user's Sandbox — the one portfolio that cannot be
 * deleted. Recognised by the id the SQL trigger and the client's self-heal
 * both generate, which is the same string on purpose so neither can create a
 * second one.
 */
function isSandbox(id: string): boolean {
  return id.startsWith('pf-sandbox-');
}

/**
 * One account's share of the aggregate. Both halves have to be known: a
 * percentage of a total we could not compute is not a percentage of anything.
 */
function sharePct(total: number | null, aggTotal: number | null): string {
  if (total === null || aggTotal === null || aggTotal === 0) return '—';
  return `${((total / aggTotal) * 100).toFixed(1)}%`;
}

/** Pension / hishtalmut / bank — totals by provider only, never merged into the
 *  portfolio number, never itemized (product rule). */
export function LongTermSavings() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const conn = s.advConnections;
  const rows = (
    [
      ['pension', 'conn.pension', '$86,340', '+6.2% YTD'],
      ['hisht', 'conn.hisht', '$31,120', '+5.4% YTD'],
      ['bank', 'conn.bank', '$7,860', ''],
    ] as const
  ).filter(([k]) => conn[k]);

  return (
    <Card padding="12px 13px 4px" gap={4}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <CardTitle>{t('pf.longTerm')}</CardTitle>
        <span style={{ marginInlineStart: 'auto' }}>
          <Tag variant="outline">{t('pf.readOnly')}</Tag>
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '4px 0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.5 }}>
            {t('pf.longTermEmpty')}
          </p>
          <Button
            variant="secondary"
            alignSelf="flex-start"
            fontSize={16}
            minHeight={36}
            onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', solo: true })}
          >
            {t('pf.longTermCta')}
          </Button>
        </div>
      ) : (
        rows.map(([k, labelKey, value, ytd]) => (
          <ListRow
            key={k}
            leading={
              <span
                style={{
                  width: 30,
                  height: 30,
                  flex: 'none',
                  borderRadius: 8,
                  background: 'var(--fill-selected)',
                  color: 'var(--color-accent-200)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                }}
              >
                {t(labelKey).slice(0, 1)}
              </span>
            }
            title={t(labelKey)}
            subtitle={`${conn[k] ?? ''} · ${t('pf.syncedAgo')}`}
            right={<RowValues main={value} sub={ytd || undefined} subColor="var(--up)" />}
            minHeight={50}
          />
        ))
      )}
    </Card>
  );
}
