import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { CandleChart } from '../components/CandleChart';
import { Chip } from '../components/Chip';
import { ListRow } from '../components/ListRow';
import { SegmentBar } from '../components/AllocationBar';
import { DataState, EmptyState } from '../components/DataState';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import type { StockStats } from '../data/types';
import type { ScreenProps } from '../App';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y'];

export function StockScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tf, setTf] = useState('3M');
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });
  const sym = useLoadable(() => demoService.symbol(s.ticker), [s.ticker]);
  const stats = useLoadable(() => demoService.stockStats(s.ticker), [s.ticker]);
  const consensus = useLoadable(() => demoService.analystConsensus(s.ticker), [s.ticker]);
  const nextEarn = useLoadable(() => demoService.nextEarnings(s.ticker), [s.ticker]);
  const news = useLoadable(() => demoService.stockNews(s.ticker), [s.ticker]);
  const inWl = s.watchlist.includes(s.ticker);

  const closes = demoService.series(`${s.ticker}-candles`, 46, 0.5, 3.4).slice(4);
  const begSeries = demoService.series(`${s.ticker}-line`, 64, 0.55, 2.6);

  return (
    <DataState state={sym.state} onRetry={sym.retry}>
      {(x) => (
        <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
              <Num size={27} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
                {money(x.price)}
              </Num>
              <Num size={14} style={{ color: signalColor(x.changePct) }}>
                {`${(x.changePct >= 0 ? '+' : '') + ((x.price * x.changePct) / 100).toFixed(2)} · ${pct(x.changePct)}`}
              </Num>
            </div>
            {stats.state.status === 'ok' && stats.state.data.afterHours && (
              <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 3 }}>
                {t('stock.afterHrs', { when: stats.state.data.afterHours.asOf[language] })}{' '}
                <Num>{money(stats.state.data.afterHours.price)}</Num>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <Button
              variant="secondary"
              style={{
                flex: 1,
                minHeight: 40,
                fontSize: 'var(--fs-md)',
                ...(inWl
                  ? {
                      border: '1px solid var(--color-accent)',
                      background: 'var(--color-accent-900)',
                      color: 'var(--color-accent-200)',
                    }
                  : {}),
              }}
              onClick={() => dispatch({ type: 'toggleWatch', ticker: s.ticker })}
            >
              {inWl ? `✓ ${t('stock.inWatchlist')}` : `＋ ${t('stock.toWatchlist')}`}
            </Button>
            <Button style={{ flex: 1, minHeight: 40, fontSize: 'var(--fs-md)' }} onClick={openAlert}>
              <Icon name="bell" size={14} strokeWidth={1.8} />
              {t('stock.addAlert')}
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {TIMEFRAMES.map((f) => (
              <Chip key={f} active={tf === f} onClick={() => setTf(f)}>
                <Num>{f}</Num>
              </Chip>
            ))}
          </div>

          {beg ? (
            <Card padding={12} gap={0}>
              <AreaChart values={begSeries} height={150} pad={8} />
              <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85 }}>
                {t('stock.chartHelp', {
                  pct: `${Math.round(((begSeries[begSeries.length - 1] - begSeries[0]) / begSeries[0]) * 100)}%`,
                })}
              </p>
            </Card>
          ) : (
            <Card padding={8} gap={2}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 4 }}>
                {(
                  [
                    ['ma', 'MA 20/50'],
                    ['rsi', 'RSI'],
                    ['macd', 'MACD'],
                  ] as const
                ).map(([k, label]) => (
                  <Chip key={k} active={ind[k]} onClick={() => setInd({ ...ind, [k]: !ind[k] })}>
                    {label}
                  </Chip>
                ))}
              </div>
              {stats.state.status === 'ok' && (
                <Num size={12} block style={{ color: 'var(--muted)' }}>
                  {`O ${stats.state.data.open.toFixed(2)} H ${stats.state.data.high.toFixed(2)} L ${stats.state.data.low.toFixed(2)} C ${x.price.toFixed(2)}`}
                </Num>
              )}
              <CandleChart closes={closes} showMA={ind.ma} showRSI={ind.rsi} showMACD={ind.macd} rsiNow={x.rsi} />
            </Card>
          )}

          <Card padding={12} gap={7}>
            <CardTitle>{beg ? t('stock.basics') : t('stock.keyStats')}</CardTitle>
            {beg ? (
              BEG_STATS(x.price, x.marketCap, x.volume, x.pe).map((row, i) => (
                <ListRow
                  key={i}
                  align="start"
                  padding="7px 0"
                  minHeight={0}
                  title={<span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>{row.k}</span>}
                  subtitle={row.help}
                  right={<Num>{row.v}</Num>}
                />
              ))
            ) : (
              <DataState state={stats.state} onRetry={stats.retry}>
                {(st) => (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                    {ADV_STATS(x.price, x.marketCap, x.volume, x.pe, x.rsi, st).map(([k, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--fs-xs)', padding: '2px 0' }}>
                        <span className="text-muted">{k}</span>
                        <Num>{v}</Num>
                      </div>
                    ))}
                  </div>
                )}
              </DataState>
            )}
          </Card>

          {!beg && (
            <Card padding={12} gap={7}>
              <CardTitle>{t('stock.analyst')}</CardTitle>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 'var(--fs-xl)', fontFamily: 'var(--font-heading)' }}>{t('stock.consensus')}</span>
                <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  {t('stock.analystMeta')}
                </span>
              </div>
              <DataState state={consensus.state} onRetry={consensus.retry}>
                {(c) => (
                  <>
                    <SegmentBar
                      segments={[
                        { value: c.strongBuy, colorVar: 'var(--up)' },
                        { value: c.buy, colorVar: 'var(--acc-mid)' },
                        { value: c.hold, colorVar: 'var(--muted-2)' },
                        { value: c.sell, colorVar: 'var(--down)' },
                      ]}
                    />
                    <div className="text-muted" style={{ display: 'flex', gap: 9, fontSize: 'var(--fs-xs)' }}>
                      <span>{`${t('stock.rateSb')} ${c.strongBuy}`}</span>
                      <span>{`${t('stock.rateB')} ${c.buy}`}</span>
                      <span>{`${t('stock.rateH')} ${c.hold}`}</span>
                      <span>{`${t('stock.rateS')} ${c.sell}`}</span>
                    </div>
                  </>
                )}
              </DataState>
            </Card>
          )}

          <Card padding={12} gap={8}>
            <CardTitle>{beg ? t('stock.newsBeg') : t('stock.newsAdv')}</CardTitle>
            <DataState state={news.state} onRetry={news.retry}>
              {(items) =>
                items.length === 0 ? (
                  <EmptyState>{t('stock.noNews')}</EmptyState>
                ) : (
                  <>
                    {items.map((a, i) => (
                      <div key={i} style={{ paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                          <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                            {`${a.time} · ${a.source} · ${a.tag}`}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--fs-sm)', fontFamily: 'var(--font-heading)', marginTop: 4, lineHeight: 1.35, whiteSpace: 'normal' }}>
                          {a.headline}
                        </div>
                        {beg && <p style={{ fontSize: 'var(--fs-sm)', margin: '3px 0 0', opacity: 0.76 }}>{a.summary}</p>}
                      </div>
                    ))}
                  </>
                )
              }
            </DataState>
          </Card>

          <DataState state={nextEarn.state} onRetry={nextEarn.retry}>
            {(ne) =>
              ne == null ? null : (
                <Card padding={12} gap={8}>
                  <CardTitle>{t('stock.nextEarn')}</CardTitle>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div
                      style={{
                        width: 50,
                        textAlign: 'center',
                        padding: '6px 0',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-accent-900)',
                        flex: 'none',
                      }}
                    >
                      <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                        {ne.month[language]}
                      </div>
                      <Num size={17} style={{ fontFamily: 'var(--font-heading)' }}>
                        {ne.day}
                      </Num>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--fs-sm)', opacity: 0.8 }}>
                      {beg ? ne.beg[language] : ne.adv}
                    </p>
                  </div>
                </Card>
              )
            }
          </DataState>
        </div>
      )}
    </DataState>
  );
}

const BEG_STATS = (price: number, mc: string, vol: string, pe: number) => [
  { k: 'Price', v: money(price), help: 'What one share costs right now' },
  { k: 'Company size', v: mc, help: 'Every share added together — market cap' },
  { k: 'Traded today', v: `${vol} shares`, help: 'How busy the stock is; high means lots of interest' },
  { k: 'Price vs earnings', v: `${pe.toFixed(1)}×`, help: 'Years of current profit to pay for the share' },
];

const ADV_STATS = (
  price: number,
  mc: string,
  vol: string,
  pe: number,
  rsi: number,
  st: StockStats,
): Array<[string, string]> => [
  ['Open', st.open.toFixed(2)],
  ['Prev close', st.prevClose.toFixed(2)],
  ['Day range', `${st.low.toFixed(2)}–${st.high.toFixed(2)}`],
  ['52w range', `${st.low52.toFixed(2)}–${st.high52.toFixed(2)}`],
  ['Volume', vol],
  ['Avg vol', st.avgVol],
  ['Mkt cap', mc],
  ['P/E', pe.toFixed(1)],
  ['Fwd P/E', st.fwdPe.toFixed(1)],
  ['EPS (ttm)', (price / pe).toFixed(2)],
  ['Beta', st.beta.toFixed(2)],
  ['Div yield', st.divYield],
  ['Short float', st.shortFloat],
  ['RSI(14)', String(rsi)],
];


