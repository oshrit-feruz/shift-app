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
import { SegmentedControl } from '../components/SegmentedControl';
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
import { loading, ok, unavailable, type Holding, type Loadable, type PortfolioSummary } from '../data/types';
import { useLoadable } from '../data/useLoadable';
import { isoDate, money, moneyOrDash, pctOrDash, signalColor, signedCurrency } from '../lib/format';
import { TxSheet, type TxPreset } from '../sheets/TxSheet';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { DeletePortfolioSheet } from '../sheets/DeletePortfolioSheet';
import {
  fetchPortfolioHoldings,
  portfolioList,
  summarizeHoldings,
  sumTotals,
  type HoldingsSummary,
  type PortfolioHoldings,
} from '../lib/holdings';
import { fetchPortfolioSeries } from '../data/portfolioHistory';
import { openGain, type PortfolioSeries } from '../lib/portfolioSeries';
import type { PortfolioValuation } from '../lib/positions';
import type { ScreenProps } from '../App';

/**
 * Which change the screen is reading out: today's move, or the return since
 * purchase. One value drives the line under the total AND every holding
 * row, so the two can never show different bases at the same time.
 */
type ChangeView = 'day' | 'open';

/**
 * The portfolio tab: one chip per account, then the selected account's value,
 * performance, allocation and holdings.
 *
 * The list is the service-reported portfolios plus the user's own manual
 * ones, built through the shared manualPortfolioSummaries() so this screen and
 * the stock page can never describe the same portfolio differently.
 */
export function PortfolioScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  // In the deps so flipping the switch re-reads. The switch is also what
  // decides the source: sample data on is the demo brokers, off is the real
  // account connected through SnapTrade (data/appService.ts).
  const demo = useDemoMode();
  const live = !demo;
  const portfolios = useLoadable(() => appService.portfolios(), [demo]);
  const [txOpen, setTxOpen] = useState(false);
  // The row being corrected, or null for a new one. Held here rather than in
  // <Transactions/> because the sheet is mounted at this level; the list only
  // says which row was tapped.
  const [editingTx, setEditingTx] = useState<ManualTransaction | null>(null);
  // What a new row opens pre-filled with — the "close position" action's
  // sell — or null for a blank sheet.
  const [txPreset, setTxPreset] = useState<TxPreset | null>(null);
  const [view, setView] = useState<ChangeView>('day');
  // Deleting asks first: it takes the whole transaction log with it.
  const [deleteOpen, setDeleteOpen] = useState(false);
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
          const list = portfolioList(pfs, s.manualPortfolios);

          // A reader who has not created a portfolio of their own and has no
          // account connected has none at all. Guarded before the index
          // below, which would otherwise read list[-1] and throw on the
          // first property access.
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
                      // "add" after an edit or a close would otherwise reopen
                      // on the row that was last handled.
                      setEditingTx(null);
                      setTxPreset(null);
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

              <SourceStrip
                pf={pf}
                linked={linked}
                onDelete={() => setDeleteOpen(true)}
                onManage={() => dispatch({ type: 'go', screen: 'connections' })}
              />

              {isAgg && (
                <AggregateAccounts
                  linked={linked}
                  aggTotal={aggTotal}
                  aggExcluded={s.aggExcluded}
                  onToggle={(id) => dispatch({ type: 'toggleAggAccount', id })}
                />
              )}

              <PortfolioBody
                pf={pf}
                headline={isAgg ? aggTotal : pf.total}
                live={live}
                view={view}
                onView={setView}
                ledger={s.manualTransactions[pf.id] ?? []}
                onClosePosition={(h) => {
                  setEditingTx(null);
                  // Every share held, at the price the row was just valued
                  // at: a sell for a long, a buy-to-cover for a short.
                  setTxPreset({
                    side: h.shares < 0 ? 'buy' : 'sell',
                    ticker: h.ticker,
                    shares: Math.abs(h.shares),
                    price: h.price,
                  });
                  setTxOpen(true);
                }}
              />

              {/* The log itself, because there is nowhere else to delete from:
                  the Holdings card lists POSITIONS, each derived from any
                  number of transactions, so a row there has no single record
                  behind it to remove. Manual portfolios only — a linked
                  account's history is the broker's, not ours to edit. */}
              {isManual && (
                <Transactions
                  pfId={pf.id}
                  onEdit={(tx) => {
                    setTxPreset(null);
                    setEditingTx(tx);
                    setTxOpen(true);
                  }}
                />
              )}

              <LongTermSavings />
              <TxSheet
                open={txOpen}
                onClose={() => setTxOpen(false)}
                pfId={pf.id}
                pfName={pf.name}
                editing={editingTx}
                preset={txPreset}
              />
              <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
              {isManual && (
                <DeletePortfolioSheet
                  open={deleteOpen}
                  onClose={() => setDeleteOpen(false)}
                  portfolio={pf}
                  transactionCount={(s.manualTransactions[pf.id] ?? []).length}
                  isSandbox={isSandbox(pf.id)}
                />
              )}
            </>
          );
        }}
      </DataState>
    </div>
  );
}

/**
 * The selected portfolio's total, its change, its allocation and its
 * holdings — from ONE read of its positions.
 *
 * They used to be three components each fetching for itself, which is how the
 * allocation card could say "the broker priced nothing" above a holdings card
 * that said "—" about the same account: each had asked a different source.
 * One read, shared, means the header, the ring and the rows cannot disagree
 * about what was priced.
 */
function PortfolioBody({
  pf,
  headline,
  live,
  view,
  onView,
  ledger,
  onClosePosition,
}: Readonly<{
  pf: PortfolioSummary;
  /** The account's own reported total, for a linked account or the aggregate. */
  headline: number | null;
  live: boolean;
  view: ChangeView;
  onView: (v: ChangeView) => void;
  ledger: ManualTransaction[];
  onClosePosition: (h: Holding) => void;
}>) {
  const t = useT();
  const isAgg = pf.kind === 'aggregate';
  const isManual = pf.kind === 'manual';
  const holdings = usePortfolioHoldings(pf.id);
  const data = holdings.state.status === 'ok' ? holdings.state.data : null;
  const summary = data ? summarizeHoldings(data.rows) : null;

  return (
    <>
      <Card padding={14} gap={8}>
        <div className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {isAgg ? t('pf.allAccounts') : pf.name} {t('pf.totalValue')}
        </div>
        {/* A manual portfolio's worth is its own positions valued at live
            prices, so it is read from the same valuation as the rows below
            rather than from the summary row — which has no way to know it. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
          <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
            {moneyOrDash(isManual ? (data?.valuation.total ?? null) : headline)}
          </Num>
        </div>
        <ChangeLine view={view} summary={summary} valuation={isManual ? (data?.valuation ?? null) : null} />
        <SegmentedControl<ChangeView>
          options={[
            { value: 'day', label: t('pf.viewDay') },
            { value: 'open', label: t('pf.viewOpen') },
          ]}
          value={view}
          onChange={onView}
          fontSize={14.5}
        />
        {isManual && data && <ManualValueNotes valuation={data.valuation} view={view} />}
        <PerformanceSlot
          live={live}
          isManual={isManual}
          pf={pf}
          ledger={ledger}
          label={isAgg ? t('pf.allAccounts') : pf.name}
        />
      </Card>

      <Card padding={14} gap={10}>
        <CardTitle>{t('pf.allocation')}</CardTitle>
        <DataState
          state={holdings.state}
          onRetry={holdings.retry}
          skeleton={<Skeleton height={132} radius="var(--radius-md)" />}
        >
          {({ rows }) => <Allocation rows={rows} />}
        </DataState>
      </Card>

      <Card padding="13px 13px 4px" gap={4}>
        <CardTitle>{t('pf.holdings')}</CardTitle>
        <DataState
          state={holdings.state}
          onRetry={holdings.retry}
          skeleton={<SkeletonList count={4} leading={false} minHeight={46} />}
        >
          {({ rows }) => (
            <Holdings rows={rows} view={view} onClose={isManual ? onClosePosition : undefined} />
          )}
        </DataState>
      </Card>
    </>
  );
}

/**
 * The line under the total: today's move or the return since purchase, in
 * currency and as a percent, coloured by its sign.
 *
 * A manual portfolio's return comes from its valuation rather than from the
 * rows added up, because its percentage is of everything ever invested —
 * including the cost of what has since been sold — and the rows no longer
 * carry that. Today's move has no such history and reads the same for every
 * kind.
 *
 * "—" while the read is in flight or when any held leg is unpriced: a sum
 * missing a leg is not a smaller number, it is a wrong one.
 */
function ChangeLine({
  view,
  summary,
  valuation,
}: Readonly<{ view: ChangeView; summary: HoldingsSummary | null; valuation: PortfolioValuation | null }>) {
  const t = useT();
  let abs: number | null = null;
  let pct: number | null = null;
  if (summary) {
    if (view === 'day') {
      abs = summary.dayChange;
      pct = summary.dayChangePct;
    } else if (valuation) {
      abs = valuation.pl;
      pct = valuation.plPct;
    } else {
      abs = summary.pl;
      pct = summary.plPct;
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--text-row)', color: signalColor(abs) }}>
        <Num>{abs === null ? '—' : signedCurrency(abs)}</Num>
        {pct !== null && (
          <>
            {' '}
            <Num>{`(${pctOrDash(pct)})`}</Num>
          </>
        )}
      </span>
      <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
        {view === 'day' ? t('pf.today') : t('pf.sincePurchase')}
      </span>
    </div>
  );
}

/**
 * One portfolio's holdings list: held first, then anything sold out — a
 * closed position is history, and history belongs under what is still open
 * rather than mixed into it where it reads as a live holding of zero shares.
 */
function Holdings({
  rows,
  view,
  onClose,
}: Readonly<{ rows: Holding[]; view: ChangeView; onClose?: (h: Holding) => void }>) {
  const dispatch = useDispatch();
  const t = useT();
  const held = rows.filter((h) => h.shares !== 0);
  const closed = rows.filter((h) => h.shares === 0);
  if (rows.length === 0) return <EmptyState>{t('pf.holdingsEmpty')}</EmptyState>;
  return (
    <>
      {held.map((h) => (
        <HoldingRow
          key={h.ticker}
          h={h}
          view={view}
          onOpen={() => dispatch({ type: 'openStock', ticker: h.ticker })}
          onClose={onClose ? () => onClose(h) : undefined}
        />
      ))}
      {closed.length > 0 && (
        <>
          <div className="text-muted" style={{ fontSize: 'var(--text-caption)', padding: '10px 0 2px' }}>
            {t('pf.closed')}
          </div>
          {closed.map((h) => (
            <HoldingRow
              key={h.ticker}
              h={h}
              view={view}
              closed
              onOpen={() => dispatch({ type: 'openStock', ticker: h.ticker })}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * One holdings row. The right-hand pair is the position's worth over its
 * change in the selected reading — today's move, or the return since
 * purchase — as money and percent together. Every figure is nullable and
 * renders as "—": a position in a ticker the price feed does not cover has
 * no worth we can state, and the old code's green "+0.00%" said it was flat
 * instead.
 */
function HoldingRow({
  h,
  view,
  closed,
  onOpen,
  onClose,
}: Readonly<{ h: Holding; view: ChangeView; closed?: boolean; onOpen: () => void; onClose?: () => void }>) {
  const t = useT();
  // A closed position has no day to speak of; what it has is what it booked,
  // and that is what it shows under either reading. It used to render "—" on
  // the day tab, which is true and useless: a row of dashes under "closed
  // positions" reads as data the app failed to load rather than as a
  // position whose result is already final.
  const abs = closed ? h.pl : view === 'day' ? h.dayChange : h.pl;
  const pct = closed ? h.plPct : view === 'day' ? h.dayChangePct : h.plPct;
  const change = abs === null ? '—' : `${signedCurrency(abs)}${pct === null ? '' : ` (${pctOrDash(pct)})`}`;
  const short = h.shares < 0;
  return (
    <ListRow
      title={
        short ? (
          <>
            {h.ticker}{' '}
            <Tag variant="outline" fontSize={12}>
              {t('pf.short')}
            </Tag>
          </>
        ) : (
          h.ticker
        )
      }
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
          // A short's size, not its sign: "−5 sh" beside a "short" tag says
          // the same thing twice, and its basis is shown by size for the same
          // reason a short's return is measured against it.
          <Num>
            {`${Math.abs(h.shares)} sh · avg ${money(h.avgCost)} · ${t('pf.costLabel')} ${money(Math.abs(h.costBasis))}`}
          </Num>
        )
      }
      right={
        <RowValues main={closed ? '—' : moneyOrDash(h.value, 0)} sub={change} subColor={signalColor(abs)} />
      }
      trailing={
        onClose && (
          <Button variant="ghost" fontSize={14} minHeight={32} onClick={onClose}>
            <span aria-label={t(short ? 'pf.coverAria' : 'pf.closeAria', { ticker: h.ticker })}>
              {t(short ? 'pf.cover' : 'pf.closePosition')}
            </span>
          </Button>
        )
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
 * Three cases that are easy to collapse and must not be. A seeded random walk
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
  pf,
  ledger,
  label,
}: Readonly<{
  live: boolean;
  isManual: boolean;
  pf: PortfolioSummary;
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
  // computed rather than invented.
  if (isManual) return <ManualValueChart ledger={ledger} label={label} />;
  // A live read of a connected account's current state: the brokerage reports
  // no priced history through the integration at all.
  if (live) return <Note>{t('live.noHistory')}</Note>;
  // Sample data: the line and its benchmark are both seeded walks, allowed
  // here because the total above them is a demo figure too.
  const drift = (pf.dayPct ?? 0) >= 0 ? 0.5 : 0.16;
  const series = demoService.series(`pf-${pf.id}`, 70, drift, 2.4);
  const bench = demoService.series('bench-spy', 70, 0.22, 1.4);
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
 * Which portfolio is selected, said in its own terms, plus the one action that
 * belongs to it.
 *
 * The three kinds are asked once at the top and answered by name, rather than
 * re-tested down each line of the card. Lifting this out of the screen also
 * lifted the two stacked conditionals that used to choose its title and its
 * subtitle inline — a reader following "what does the header say for a manual
 * portfolio" had to unwind both.
 */
function SourceStrip({
  pf,
  linked,
  onDelete,
  onManage,
}: Readonly<{
  pf: PortfolioSummary;
  linked: PortfolioSummary[];
  onDelete: () => void;
  onManage: () => void;
}>) {
  const t = useT();
  const { language } = useTheme();
  const isAgg = pf.kind === 'aggregate';
  const isManual = pf.kind === 'manual';

  let title: string;
  if (isAgg) title = t('pf.allLinked');
  else if (isManual) title = pf.name;
  else title = `${pf.broker} ${pf.acct}`;

  let detail: string;
  if (isAgg) detail = t('pf.aggDetail');
  else if (isManual) detail = t('pf.manualDetail');
  // A brokerage that gave no fetch time gets no "synced" claim — only the
  // one thing that is true of it either way.
  else if (pf.syncedAgo) detail = t('pf.synced', { when: pf.syncedAgo[language] });
  else detail = t('pf.readOnly');

  return (
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
      {isManual && <LogoTile src={null} dashed label={pf.name.slice(0, 2).toUpperCase()} size={28} />}
      <span style={{ flex: 1, minWidth: 0, marginInlineStart: 10 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{title}</span>
        <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
          {detail}
        </span>
      </span>
      {/* Every manual portfolio, the Sandbox included since
          0008_portfolio_delete.sql lifted the database's guard on it.
          The button opens a confirmation, never deletes by itself. */}
      {isManual ? (
        <Button variant="ghost" fontSize={15.5} onClick={() => onDelete()}>
          {t('pf.delete')}
        </Button>
      ) : (
        <Button variant="ghost" fontSize={15.5} onClick={() => onManage()}>
          {isAgg || pf.kind === 'linked' ? t('pf.manage') : t('pf.link')}
        </Button>
      )}
    </Card>
  );
}

/**
 * The accounts inside the aggregate, and which of them it is counting.
 *
 * Excluding one is the user's own choice about their own total, so the row
 * says which state it is in rather than only dimming: a greyed row with a
 * figure beside it reads as a number the app failed to refresh.
 */
function AggregateAccounts({
  linked,
  aggTotal,
  aggExcluded,
  onToggle,
}: Readonly<{
  linked: PortfolioSummary[];
  aggTotal: number | null;
  aggExcluded: Record<string, boolean>;
  onToggle: (id: string) => void;
}>) {
  const t = useT();

  return (
    <Card padding="4px 0" gap={0}>
      <CardTitle size={17}>
        <span style={{ padding: '9px 13px 2px', display: 'block' }}>{t('pf.byAccount')}</span>
      </CardTitle>
      <div className="text-muted" style={{ fontSize: 'var(--text-caption)', padding: '0 13px 6px' }}>
        {t('pf.aggPickHelp')}
      </div>
      {linked.map((x) => {
        const on = !aggExcluded[x.id];
        return (
          <button
            key={x.id}
            type="button"
            onClick={() => onToggle(x.id)}
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
              <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
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
      <Button variant="secondary" alignSelf="flex-start" fontSize={16} minHeight={36} onClick={onNew}>
        ＋ {t('pf.portfolio')}
      </Button>
      <NewPortfolioSheet open={newPfOpen} onClose={onCloseNew} />
    </>
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
        // Asked before the no-history case, because it is the opposite claim:
        // the history is fine and the ledger has simply overtaken it. During a
        // trading day this is where a portfolio logged this morning lands, so
        // getting the order wrong tells most new users something false.
        if (series.aheadOfLastClose) return <Note>{t('pf.valueAheadOfClose')}</Note>;
        // The provider answered and had nothing to say about these symbols —
        // which is a fact about the holdings, not a failure of the read, and
        // the two must not be worded the same way.
        if (priced.length === 0) return <Note>{t('pf.valueNoHistory')}</Note>;
        // A line needs two points to exist. With one, sparseLinePath emits a
        // bare "M x y" and sparseAreaPath emits nothing at all, so the chart
        // area rendered blank while the legend and the open P/L beside it
        // rendered normally — the screen looked broken. Say which it is.
        if (priced.length === 1) return <Note>{t('pf.valueOneSession')}</Note>;

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
 * What a manual portfolio's figures are figures OF, and — when its total
 * cannot be stated — which holdings are the reason.
 *
 * A silent "—" over a list of real positions reads as a broken app; naming
 * what could not be priced is the difference between "we don't know" and
 * "something went wrong".
 */
function ManualValueNotes({
  valuation,
  view,
}: Readonly<{ valuation: PortfolioValuation; view: ChangeView }>) {
  const t = useT();
  return (
    <>
      {/* Only under the reading it describes. On the day tab the figure above
          is today's move, and captioning that "total return of X invested"
          labelled it as something it is not. */}
      {view === 'open' && valuation.positions.length > 0 && valuation.invested > 0 && (
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {t('pf.totalReturn')} · {t('pf.returnBasis', { invested: money(valuation.invested) })}
        </span>
      )}
      {valuation.unpriced.length > 0 && (
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
 * One portfolio's holdings and valuation. The total above the chart, the
 * allocation ring and the holdings card all read through this, which is the
 * point: they used to be computed separately, which is how a confident
 * dollar total could sit above a list of positions the app had just failed
 * to price.
 */
function usePortfolioHoldings(pfId: string) {
  const s = useAppState();
  const demo = useDemoMode();
  const transactions = s.manualTransactions[pfId] ?? [];
  // Keyed on the log's identity, so a transaction added or removed re-values
  // at once rather than after the next visit.
  const key = transactions.map((tx) => tx.id).join(',');
  return useLoadable<PortfolioHoldings>(() => fetchPortfolioHoldings(pfId, transactions), [pfId, demo, key]);
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
 * Allocation computed from the portfolio's actual positions — the same rows
 * the holdings card lists, for every kind of portfolio.
 *
 * Only priced positions can be weighted, and a SHORT is priced but has a
 * negative value: a ring draws shares of a positive total, so it is excluded
 * and NAMED, because dropping it silently made a two-position account read
 * as "ORCL 100%". An unpriced long is named for the same reason.
 */
function Allocation({ rows }: Readonly<{ rows: Holding[] }>) {
  const t = useT();
  const held = rows.filter((r) => r.shares !== 0);
  // A null value is a position that could not be priced; it is not a zero,
  // and it cannot be given a share of a total either.
  const unpriced = held.filter((r) => r.value === null);
  const shorts = held.filter((r) => r.value !== null && r.value < 0);
  const priced = held.filter((r) => r.value !== null && r.value > 0);
  const total = priced.reduce((sum, r) => sum + (r.value ?? 0), 0);
  if (held.length === 0) return <EmptyState>{t('pf.holdingsEmpty')}</EmptyState>;
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
        <Note>{t('live.shortExcluded', { tickers: shorts.map((r) => r.ticker).join(', ') })}</Note>
      )}
      {unpriced.length > 0 && (
        <Note>{t('pf.unpricedExcluded', { tickers: unpriced.map((r) => r.ticker).join(', ') })}</Note>
      )}
    </>
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
 * Whether this is the user's Sandbox — the portfolio every account starts
 * with. Recognised by the id the SQL signup trigger generates. Deleting it
 * is allowed and asks first; the sheet uses this to say that no second
 * Sandbox can be made.
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
