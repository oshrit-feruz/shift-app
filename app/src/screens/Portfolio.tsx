import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
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
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { ok, type Holding } from '../data/types';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import { TxSheet } from '../sheets/TxSheet';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { mergeManualTransactions, portfolioList } from '../lib/holdings';
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
  const portfolios = useLoadable(() => demoService.portfolios(), [demo]);
  const [txOpen, setTxOpen] = useState(false);
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
              <>
                <DemoOnly feature="connScreen.linked">
                  <Button
                    variant="secondary"
                    alignSelf="flex-start"
                    fontSize={16}
                    minHeight={36}
                    onClick={() => setNewPfOpen(true)}
                  >
                    ＋ {t('pf.portfolio')}
                  </Button>
                </DemoOnly>
                <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
              </>
            );
          }

          const pf = list[Math.min(s.pfIndex, list.length - 1)];
          const isAgg = pf.kind === 'aggregate';
          const isManual = pf.kind === 'manual';
          const linked = list.filter((x) => x.kind === 'linked');
          const inAgg = linked.filter((x) => !s.aggExcluded[x.id]);
          const aggTotal = inAgg.reduce((a, x) => a + x.total, 0);
          const series = demo ? demoService.series(`pf-${pf.id}`, 70, pf.dayPct >= 0 ? 0.5 : 0.16, 2.4) : [];
          const bench = demo ? demoService.series('bench-spy', 70, 0.22, 1.4) : [];
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
                    onClick={() => setTxOpen(true)}
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
                        ? t('pf.sandboxDetail')
                        : t('pf.synced', { when: pf.syncedAgo?.[language] ?? '' })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  fontSize={15.5}
                  onClick={() => dispatch({ type: 'go', screen: 'connections' })}
                >
                  {isAgg || pf.kind === 'linked' ? t('pf.manage') : t('pf.link')}
                </Button>
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
                            {on ? `${((x.total / aggTotal) * 100).toFixed(1)}%` : t('pf.excluded')}
                          </span>
                        </span>
                        <span style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                          <RowValues
                            main={money(x.total)}
                            sub={pct(x.dayPct)}
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
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                  <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
                    {money(isAgg ? aggTotal : pf.total)}
                  </Num>
                  <span
                    style={{ fontSize: 'var(--text-body)', color: signalColor(pf.dayPct), paddingBottom: 3 }}
                  >
                    <Num>{pct(pf.dayPct)}</Num> {t('pf.today')}
                  </span>
                </div>
                {demo ? (
                  <>
                    <AreaChart values={series} height={110} pad={8} benchmark={bench} />
                    <div
                      className="text-muted"
                      style={{ display: 'flex', gap: 14, fontSize: 'var(--text-caption)' }}
                    >
                      <span>
                        <span style={{ color: 'var(--acc-lite)' }}>—</span>{' '}
                        {isAgg ? t('pf.allAccounts') : pf.name}
                      </span>
                      <span>{t('pf.benchmark')}</span>
                    </div>
                  </>
                ) : (
                  // The line and its benchmark are both seeded walks; a manual
                  // portfolio has no priced history to draw instead.
                  <DemoOnly feature="pf.performance" card={false} />
                )}
              </Card>

              {demo ? (
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
              ) : (
                <DemoOnly feature="pf.allocation" />
              )}

              <Card padding="13px 13px 4px" gap={4}>
                <CardTitle>{t('pf.holdings')}</CardTitle>
                {holdings}
              </Card>

              {demo ? <LongTermSavings /> : <DemoOnly feature="pf.longTerm" />}
              <TxSheet open={txOpen} onClose={() => setTxOpen(false)} pfId={pf.id} pfName={pf.name} />
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
function Holdings({ pfId }: { pfId: string }) {
  const s = useAppState();
  const dispatch = useDispatch();
  // No message here: the card keeps its title and its real half. With sample
  // data off the service rows are simply empty, so what remains is exactly the
  // transactions the user logged — and EmptyState when there are none.
  const demo = useDemoMode();
  const holdings = useLoadable(
    () => (demo ? demoService.holdings(pfId) : Promise.resolve(ok<Holding[]>([]))),
    [pfId, demo],
  );
  const transactions = s.manualTransactions[pfId] ?? [];

  return (
    <DataState
      state={holdings.state}
      onRetry={holdings.retry}
      skeleton={<SkeletonList count={4} leading={false} minHeight={46} />}
    >
      {(rows) => {
        const mergedRows = mergeManualTransactions(rows, transactions);
        return mergedRows.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          <>
            {mergedRows.map((h) => (
              <ListRow
                key={h.ticker}
                title={h.ticker}
                subtitle={<Num>{`${h.shares} sh · avg ${money(h.avgCost)}`}</Num>}
                right={
                  <RowValues main={money(h.value, 0)} sub={pct(h.plPct)} subColor={signalColor(h.plPct)} />
                }
                minHeight={46}
                onClick={() => dispatch({ type: 'openStock', ticker: h.ticker })}
              />
            ))}
          </>
        );
      }}
    </DataState>
  );
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
