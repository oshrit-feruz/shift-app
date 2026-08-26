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
import { ALLOC_COLORS } from '../components/AllocationBar';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import { TxSheet } from '../sheets/TxSheet';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import type { ScreenProps } from '../App';

export function PortfolioScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const portfolios = useLoadable(() => demoService.portfolios(), []);
  const [txOpen, setTxOpen] = useState(false);
  const [newPfOpen, setNewPfOpen] = useState(false);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DataState state={portfolios.state} onRetry={portfolios.retry}>
        {(pfs) => {
          const list = pfs;
          const pf = list[Math.min(s.pfIndex, list.length - 1)];
          const isAgg = pf.kind === 'aggregate';
          const isManual = pf.kind === 'manual';
          const linked = list.filter((x) => x.kind === 'linked');
          const inAgg = linked.filter((x) => !s.aggExcluded[x.id]);
          const aggTotal = inAgg.reduce((a, x) => a + x.total, 0);
          const series = demoService.series(`pf-${pf.id}`, 70, pf.dayPct >= 0 ? 0.5 : 0.16, 2.4);
          const bench = demoService.series('bench-spy', 70, 0.22, 1.4);
          const holdings = <Holdings pfId={pf.id} />;

          return (
            <>
              <ChipRail>
                {list.map((x, i) => (
                  <Chip key={x.id} big active={i === Math.min(s.pfIndex, list.length - 1)} onClick={() => dispatch({ type: 'pfIndex', index: i })}>
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
                  <Button style={{ flex: 1, fontSize: 13, minHeight: 36 }} onClick={() => setTxOpen(true)}>
                    ＋ {t('pf.addTx')}
                  </Button>
                )}
                <Button variant="secondary" style={{ fontSize: 13, minHeight: 36 }} onClick={() => setNewPfOpen(true)}>
                  ＋ {t('pf.portfolio')}
                </Button>
              </div>

              {/* Source strip */}
              <Card padding="11px 12px" gap={0} row>
                {pf.kind === 'linked' && <LogoTile src={pf.logo} size={28} />}
                {isAgg && (
                  <span style={{ display: 'flex', flex: 'none', marginInlineEnd: 8 }}>
                    {linked.map((l) => (
                      <span key={l.id} style={{ marginInlineEnd: -8, borderRadius: 7, boxShadow: '0 0 0 2px var(--color-surface)' }}>
                        <LogoTile src={l.logo} size={26} />
                      </span>
                    ))}
                  </span>
                )}
                {isManual && <LogoTile src={null} dashed label="SB" size={28} />}
                <span style={{ flex: 1, minWidth: 0, marginInlineStart: 10 }}>
                  <span style={{ display: 'block', fontSize: 14 }}>
                    {isAgg ? t('pf.allLinked') : isManual ? t('pf.sandboxTitle') : `${pf.broker} ${pf.acct}`}
                  </span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>
                    {isAgg
                      ? t('pf.aggDetail')
                      : isManual
                        ? t('pf.sandboxDetail')
                        : t('pf.synced', { when: pf.syncedAgo?.[language] ?? '' })}
                  </span>
                </span>
                <Button variant="ghost" fontSize={12.5} onClick={() => dispatch({ type: 'go', screen: 'connections' })}>
                  {isAgg || pf.kind === 'linked' ? t('pf.manage') : t('pf.link')}
                </Button>
              </Card>

              {isAgg && (
                <Card padding="4px 0" gap={0}>
                  <CardTitle size={14}>
                    <span style={{ padding: '9px 13px 2px', display: 'block' }}>{t('pf.byAccount')}</span>
                  </CardTitle>
                  <div className="text-muted" style={{ fontSize: 12.5, padding: '0 13px 6px' }}>
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
                            fontSize: 12,
                            ...(on
                              ? { background: 'var(--color-accent)', color: 'var(--g2)' }
                              : { border: '1px solid var(--color-divider)', color: 'transparent' }),
                          }}
                        >
                          ✓
                        </span>
                        <LogoTile src={x.logo} size={26} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14 }}>{x.name}</span>
                          <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>
                            {on ? `${((x.total / aggTotal) * 100).toFixed(1)}%` : t('pf.excluded')}
                          </span>
                        </span>
                        <span style={{ textAlign: 'end', whiteSpace: 'nowrap' }}>
                          <RowValues main={money(x.total)} sub={pct(x.dayPct)} subColor={signalColor(x.dayPct)} />
                        </span>
                      </button>
                    );
                  })}
                </Card>
              )}

              <Card padding={14} gap={8}>
                <div className="text-muted" style={{ fontSize: 12.5 }}>
                  {isAgg ? t('pf.allAccounts') : pf.name} {t('pf.totalValue')}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                  <Num size={27} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
                    {money(isAgg ? aggTotal : pf.total)}
                  </Num>
                  <span style={{ fontSize: 13, color: signalColor(pf.dayPct), paddingBottom: 3 }}>
                    <Num>{pct(pf.dayPct)}</Num> {t('pf.today')}
                  </span>
                </div>
                <AreaChart values={series} height={110} pad={8} benchmark={bench} />
                <div className="text-muted" style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
                  <span>
                    <span style={{ color: 'var(--acc-lite)' }}>—</span> {isAgg ? t('pf.allAccounts') : pf.name}
                  </span>
                  <span>{t('pf.benchmark')}</span>
                </div>
              </Card>

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
                  <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                    {t('pf.concentration')}
                  </p>
                )}
              </Card>

              <Card padding="13px 13px 4px" gap={4}>
                <CardTitle>{t('pf.holdings')}</CardTitle>
                {holdings}
              </Card>

              <LongTermSavings />
              <TxSheet open={txOpen} onClose={() => setTxOpen(false)} pfName={pf.name} />
              <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
            </>
          );
        }}
      </DataState>
    </div>
  );
}

function Holdings({ pfId }: { pfId: string }) {
  const dispatch = useDispatch();
  const holdings = useLoadable(() => demoService.holdings(pfId), [pfId]);
  return (
    <DataState state={holdings.state} onRetry={holdings.retry}>
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          <>
            {rows.map((h) => (
              <ListRow
                key={h.ticker}
                title={h.ticker}
                subtitle={<Num>{`${h.shares} sh · avg ${money(h.avgCost)}`}</Num>}
                right={<RowValues main={money(h.value, 0)} sub={pct(h.plPct)} subColor={signalColor(h.plPct)} />}
                minHeight={46}
                onClick={() => dispatch({ type: 'openStock', ticker: h.ticker })}
              />
            ))}
          </>
        )
      }
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
          <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            {t('pf.longTermEmpty')}
          </p>
          <Button
            variant="secondary"
            alignSelf="flex-start"
            fontSize={13}
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
                  background: 'var(--color-accent-900)',
                  color: 'var(--color-accent-200)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
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
