import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { CandleChart } from '../components/CandleChart';
import { Chip } from '../components/Chip';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { ListRow, RowValues } from '../components/ListRow';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { fetchYourPositions } from '../lib/holdings';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y'];

export function StockScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tf, setTf] = useState('3M');
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });
  const sym = useLoadable(() => demoService.symbol(s.ticker), [s.ticker]);
  const inWl = s.watchlist.includes(s.ticker);
  const positions = useLoadable(() => fetchYourPositions(s.ticker, s.manualTransactions), [
    s.ticker,
    s.manualTransactions,
  ]);

  const closes = demoService.series(`${s.ticker}-candles`, 46, 0.5, 3.4).slice(4);
  const begSeries = demoService.series(`${s.ticker}-line`, 64, 0.55, 2.6);

  return (
    <DataState
      state={sym.state}
      onRetry={sym.retry}
      skeleton={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Skeleton width="52%" height={28} />
            <Skeleton width="38%" height={13} />
          </div>
          <SkeletonCard height={188} lines={3} />
          <SkeletonCard height={132} lines={2} />
          <SkeletonCard height={150} lines={3} />
        </div>
      }
    >
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
            <div className="text-muted" style={{ fontSize: 13, marginTop: 3 }}>
              {t('stock.afterHrs')} <Num>{money(x.price * 1.004)}</Num>
            </div>
          </div>

          <DataState
            state={positions.state}
            onRetry={positions.retry}
            skeleton={<SkeletonList count={1} leading={false} minHeight={46} />}
          >
            {(rows) =>
              rows.length === 0 ? null : (
                <Card padding="12px 13px 4px" gap={7}>
                  <CardTitle>{t('stock.yourHoldings')}</CardTitle>
                  {rows.map(({ portfolio, holding }) => (
                    <ListRow
                      key={portfolio.id}
                      title={portfolio.kind === 'manual' ? portfolio.name : `${portfolio.broker}`}
                      subtitle={<Num>{`${holding.shares} sh · avg ${money(holding.avgCost)}`}</Num>}
                      right={
                        <RowValues
                          main={money(holding.value, 0)}
                          sub={pct(holding.plPct)}
                          subColor={signalColor(holding.plPct)}
                        />
                      }
                      minHeight={46}
                      onClick={() => dispatch({ type: 'go', screen: 'pf' })}
                    />
                  ))}
                </Card>
              )
            }
          </DataState>

          <div style={{ display: 'flex', gap: 7 }}>
            <Button
              variant="secondary"
              style={{
                flex: 1,
                minHeight: 40,
                fontSize: 14,
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
            <Button style={{ flex: 1, minHeight: 40, fontSize: 14 }} onClick={openAlert}>
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
              <p style={{ fontSize: 13, lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85 }}>
                {t('stock.chartHelp', { pct: '18%' })}
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
              <Num size={12} block style={{ color: 'var(--muted)' }}>
                {`O ${(x.price - 1.9).toFixed(2)} H ${(x.price + 2.4).toFixed(2)} L ${(x.price - 3.1).toFixed(2)} C ${x.price.toFixed(2)}`}
              </Num>
              <CandleChart closes={closes} showMA={ind.ma} showRSI={ind.rsi} showMACD={ind.macd} rsiNow={x.rsi} />
            </Card>
          )}

          <Card padding={12} gap={7}>
            <CardTitle>{beg ? t('stock.basics') : t('stock.keyStats')}</CardTitle>
            {beg ? (
              BEG_STATS(x.price, x.marketCap, x.volume, x.pe).map((row, i) => (
                <div key={i} style={{ padding: '7px 0', borderTop: '1px solid var(--color-divider)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                    <span>{row.k}</span>
                    <Num>{row.v}</Num>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {row.help}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                {ADV_STATS(x.price, x.marketCap, x.volume, x.pe, x.rsi).map(([k, v], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '2px 0' }}>
                    <span className="text-muted">{k}</span>
                    <Num>{v}</Num>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Shown in both modes: the ratings bar and counts are already
              plain-language, so there was no beginner-specific reason to
              hide analyst sentiment from that mode. */}
          <Card padding={12} gap={7}>
            <CardTitle>{t('stock.analyst')}</CardTitle>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 18, fontFamily: 'var(--font-heading)' }}>{t('stock.consensus')}</span>
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                {t('stock.analystMeta')}
              </span>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
              <div style={{ flex: 31, background: 'var(--up)' }} />
              <div style={{ flex: 11, background: 'var(--acc-mid)' }} />
              <div style={{ flex: 8, background: 'var(--muted-2)' }} />
              <div style={{ flex: 3, background: 'var(--down)' }} />
            </div>
            <div className="text-muted" style={{ display: 'flex', gap: 9, fontSize: 12.5 }}>
              <span>{t('stock.rateSb')}</span>
              <span>{t('stock.rateB')}</span>
              <span>{t('stock.rateH')}</span>
              <span>{t('stock.rateS')}</span>
            </div>
          </Card>

          <Card padding={12} gap={8}>
            <CardTitle>{beg ? t('stock.newsBeg') : t('stock.newsAdv')}</CardTitle>
            {(beg ? BEG_NEWS : ADV_NEWS).map((a, i) => (
              <div key={i} style={{ paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    {a.meta}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontFamily: 'var(--font-heading)', marginTop: 4, lineHeight: 1.35, whiteSpace: 'normal' }}>
                  {a.head}
                </div>
                {a.sum && (
                  <p style={{ fontSize: 13, margin: '3px 0 0', opacity: 0.76 }}>{a.sum}</p>
                )}
              </div>
            ))}
          </Card>

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
                <div className="text-muted" style={{ fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  {t('stock.nov')}
                </div>
                <Num size={17} style={{ fontFamily: 'var(--font-heading)' }}>
                  18
                </Num>
              </div>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                {beg
                  ? 'Q3 results, after the close. The last four reports beat expectations and the stock moved 6–9% the next day each time.'
                  : 'Q3 · Nov 18 AMC · est EPS 1.24 vs 0.68 y/y · implied move ±8.4% · 4/4 beats'}
              </p>
            </div>
          </Card>
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

const ADV_STATS = (price: number, mc: string, vol: string, pe: number, rsi: number): Array<[string, string]> => [
  ['Open', (price - 1.9).toFixed(2)],
  ['Prev close', (price * 0.99).toFixed(2)],
  ['Day range', `${(price - 3.1).toFixed(2)}–${(price + 2.4).toFixed(2)}`],
  ['52w range', '86.62–184.48'],
  ['Volume', vol],
  ['Avg vol', '162.4M'],
  ['Mkt cap', mc],
  ['P/E', pe.toFixed(1)],
  ['Fwd P/E', (pe * 0.62).toFixed(1)],
  ['EPS (ttm)', (price / pe).toFixed(2)],
  ['Beta', '2.14'],
  ['Div yield', '0.02%'],
  ['Short float', '1.1%'],
  ['RSI(14)', String(rsi)],
];

const BEG_NEWS = [
  { meta: 'Reuters · 2h', head: 'Nvidia guides data-centre revenue above expectations', sum: 'The company told investors it expects to sell more AI chips next quarter than analysts had penciled in.' },
  { meta: 'Bloomberg · 6h', head: 'New Blackwell variant enters volume production', sum: 'A cheaper version of its flagship chip starts shipping, aimed at customers priced out of the top model.' },
  { meta: "Barron's · 1d", head: 'Two more banks lift price targets above $210', sum: 'Analysts set a target for where they think a share should trade. It is an opinion, not a promise.' },
];

const ADV_NEWS = [
  { meta: '16:04 · Reuters', head: 'Nvidia guides data-centre revenue above consensus', sum: null },
  { meta: '15:41 · Bloomberg', head: 'Blackwell Ultra enters volume production at TSMC', sum: null },
  { meta: '14:58 · SEC 8-K', head: 'Item 5.02 — appointment of principal accounting officer', sum: null },
  { meta: "13:22 · Barron's", head: 'Morgan Stanley raises PT to $215 from $195', sum: null },
  { meta: '11:07 · WSJ', head: 'Hyperscaler capex plans point to sustained AI demand', sum: null },
  { meta: '09:31 · Benzinga', head: 'Unusual options activity in weekly $190 calls', sum: null },
];
