import { useEffect, useMemo, useState } from 'react';
import { DemoDataNote } from '../components/DemoDataNote';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { CandleChart } from '../components/CandleChart';
import { Chip } from '../components/Chip';
import { SegmentedControl } from '../components/SegmentedControl';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { ListRow, RowValues } from '../components/ListRow';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { fetchYourPositions } from '../lib/holdings';
import { fetchTickerEarnings } from '../data/earnings';
import { DemoBanner } from '../components/DemoBanner';
import { money, pct, signalColor } from '../lib/format';
import { ReportsTab, EarningsHistory } from './stock/ReportsTab';
import { NewsTab } from './stock/NewsTab';
import { TabPanel } from '../components/TabPanel';
import { EngineCard } from './stock/EngineCard';
import type { ScreenProps } from '../App';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y'];

type StockTab = 'overview' | 'reports' | 'news';

/**
 * A single ticker's page: price and after-hours header, watchlist/alert
 * actions, chart with timeframe and indicator toggles, the user's own
 * position in it across portfolios, key statistics, analyst ratings and
 * related news.
 *
 * The holdings card sits right under the chart — reading price action then
 * checking your own position against it is the natural next step, ahead of
 * the more reference-like stats below.
 *
 * Beginner mode hides the indicator controls and swaps the denser tables for
 * plain-language cards; it no longer hides analyst ratings, which read the
 * same in both modes.
 */
export function StockScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tab, setTab] = useState<StockTab>('overview');
  // openStock can change the ticker while this screen stays mounted (stock ->
  // stock, from search or a news chip), and the sub-tab is about the stock
  // you were looking at, not the one you just opened.
  useEffect(() => setTab('overview'), [s.ticker]);
  const [tf, setTf] = useState('3M');
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });
  const sym = useLoadable(() => demoService.symbol(s.ticker), [s.ticker]);
  const inWl = s.watchlist.includes(s.ticker);
  const positions = useLoadable(
    () => fetchYourPositions(s.ticker, s.manualTransactions, s.manualPortfolios),
    [s.ticker, s.manualTransactions, s.manualPortfolios],
  );

  // Deterministic per ticker — recomputing them on every chip tap (tf/ind
  // are unrelated state) was wasted work, so memo on the ticker alone.
  const closes = useMemo(() => demoService.series(`${s.ticker}-candles`, 46, 0.5, 3.4).slice(4), [s.ticker]);
  const begSeries = useMemo(() => demoService.series(`${s.ticker}-line`, 64, 0.55, 2.6), [s.ticker]);

  // The sample price table covers a handful of tickers. Any other symbol —
  // and the earnings calendar opens plenty of them — has no quote, but its
  // filings, news and ranking are live and per-ticker. Gating the whole
  // screen on the quote turned "we have no sample price for CRWD" into a
  // dead page, which is a worse answer than the one the data supports.
  if (sym.state.status === 'unavailable') {
    return <LiveOnlyStock ticker={s.ticker} />;
  }

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
          <DemoDataNote />
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

          {/* Sub-tabs. Overview keeps the price-action reading flow; Reports
              and News each own a live data source and load only when opened,
              so a stock page costs one Render call at most and only when
              someone actually asks for filings. */}
          <SegmentedControl<StockTab>
            options={[
              { value: 'overview', label: t('stock.tabOverview') },
              { value: 'reports', label: t('stock.tabReports') },
              { value: 'news', label: t('stock.tabNews') },
            ]}
            value={tab}
            onChange={setTab}
          />

          <TabPanel key={`ov-${s.ticker}`} active={tab === 'overview'}>
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
                <CandleChart
                  closes={closes}
                  showMA={ind.ma}
                  showRSI={ind.rsi}
                  showMACD={ind.macd}
                  rsiNow={x.rsi}
                />
              </Card>
            )}

            <DataState
              state={positions.state}
              onRetry={positions.retry}
              skeleton={<SkeletonList count={1} leading={false} minHeight={46} />}
            >
              {(rows) =>
                rows.length === 0 ? null : (
                  <Card padding="12px 13px 4px" gap={7}>
                    <CardTitle>{t('stock.yourHoldings')}</CardTitle>
                    {rows.map(({ portfolio, holding, index }) => (
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
                        // Select this row's account first: the Portfolio tab
                        // renders whichever portfolio pfIndex points at, so
                        // navigating without setting it opens whichever account
                        // was last looked at rather than the one just tapped.
                        onClick={() => {
                          dispatch({ type: 'pfIndex', index });
                          dispatch({ type: 'go', screen: 'pf' });
                        }}
                      />
                    ))}
                  </Card>
                )
              }
            </DataState>

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
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 12.5,
                        padding: '2px 0',
                      }}
                    >
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
                <span style={{ fontSize: 18, fontFamily: 'var(--font-heading)' }}>
                  {t('stock.consensus')}
                </span>
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

            <NextEarnings ticker={s.ticker} />

            {/* The engine's own view, from the mirrored daily ranking. Kept as
              its own card rather than folded into the header because most
              tickers are not in a 100-name ranking, and "not covered" is a
              real answer that needs room to say so. */}
            <EngineCard ticker={s.ticker} />
          </TabPanel>

          {/* Keyed by ticker: a stock→stock navigation resets the visited
              flags, so tabs never opened for the new symbol stay unfetched
              (the one-Render-call-per-tab cost rule above still holds). */}
          <TabPanel key={`re-${s.ticker}`} active={tab === 'reports'}>
            <ReportsTab ticker={s.ticker} />
            <EarningsHistory ticker={s.ticker} />
          </TabPanel>
          <TabPanel key={`ne-${s.ticker}`} active={tab === 'news'}>
            <NewsTab ticker={s.ticker} />
          </TabPanel>
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
): Array<[string, string]> => [
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

/**
 * When this company next reports, from the live earnings source.
 *
 * This replaced a hard-coded card that read "Q3 · Nov 18 AMC · est EPS 1.24
 * vs 0.68 y/y · implied move ±8.4% · 4/4 beats" for every stock in the app —
 * a fixed date, a fixed estimate and a fabricated implied move, rendered
 * with the same weight as real figures.
 *
 * It renders nothing at all when no scheduled report is known: an absent
 * card says less than a card that has to explain itself, and "we do not know
 * when they next report" is not information anyone came for. A provider
 * failure is likewise silent here, because the Reports tab on this same
 * screen already reports it in full.
 */
function NextEarnings({ ticker }: { ticker: string }) {
  const t = useT();
  const { language } = useTheme();
  const e = useLoadable(() => fetchTickerEarnings(ticker), [ticker]);
  if (e.state.status !== 'ok') return null;

  const today = new Date().toISOString().slice(0, 10);
  // Scheduled means: no reported figure yet, and not in the past.
  const next = e.state.data.rows
    .filter((r) => r.actual === null && r.reportDate >= today)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))[0];
  if (!next) return null;

  const [y, m, d] = next.reportDate.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <Card padding={12} gap={8}>
      <CardTitle>{t('stock.nextEarn')}</CardTitle>
      <DemoBanner />
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
          <div
            className="text-muted"
            style={{ fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase' }}
          >
            {month}
          </div>
          <Num size={17} style={{ fontFamily: 'var(--font-heading)' }}>
            {next.reportDate.slice(8)}
          </Num>
        </div>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Only what the provider actually carries: the date, the timing
              when stated, and the consensus estimate when published. */}
          {next.timing === 'AMC' && <span>{t('home.afterClose')}</span>}
          {next.timing === 'BMO' && <span>{t('home.beforeOpen')}</span>}
          {next.estimate !== null && (
            <span>
              {t('stock.epsEst')} <Num>{next.estimate.toFixed(2)}</Num>
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}

/**
 * The stock page for a symbol the sample price table does not cover.
 *
 * Everything here is live and keyed on the ticker: the engine's ranking view,
 * filed figures, the quarterly history and the news. What is missing is
 * missing for a stated reason, in one line, rather than by the page refusing
 * to render.
 */
function LiveOnlyStock({ ticker }: { ticker: string }) {
  const t = useT();
  const dispatch = useDispatch();
  const s = useAppState();
  const [tab, setTab] = useState<'reports' | 'news'>('reports');
  const inWl = s.watchlist.includes(ticker);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0, padding: '0 2px', lineHeight: 1.45 }}>
        {t('stock.noQuote')}
      </p>

      <Button
        variant="secondary"
        style={{
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
        onClick={() => dispatch({ type: 'toggleWatch', ticker })}
      >
        {inWl ? `✓ ${t('stock.inWatchlist')}` : `＋ ${t('stock.toWatchlist')}`}
      </Button>

      <EngineCard ticker={ticker} />

      <SegmentedControl<'reports' | 'news'>
        options={[
          { value: 'reports', label: t('stock.tabReports') },
          { value: 'news', label: t('stock.tabNews') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel key={`re-${ticker}`} active={tab === 'reports'}>
        <NextEarnings ticker={ticker} />
        <ReportsTab ticker={ticker} />
        <EarningsHistory ticker={ticker} />
      </TabPanel>
      <TabPanel key={`ne-${ticker}`} active={tab === 'news'}>
        <NewsTab ticker={ticker} />
      </TabPanel>
    </div>
  );
}
