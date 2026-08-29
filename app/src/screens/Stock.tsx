import { useState } from 'react';
import { DemoDataNote } from '../components/DemoDataNote';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { CandleChart } from '../components/CandleChart';
import { rsi } from '../components/charts';
import { Chip } from '../components/Chip';
import { SegmentedControl } from '../components/SegmentedControl';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { ListRow, RowValues } from '../components/ListRow';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { fetchYourPositions } from '../lib/holdings';
import { fetchTickerEarnings } from '../data/earnings';
import { DemoBanner } from '../components/DemoBanner';
import { compactCount, money, moneyOrDash, pct, signalColor } from '../lib/format';
import { ReportsTab, EarningsHistory } from './stock/ReportsTab';
import { NewsTab } from './stock/NewsTab';
import { TabPanel } from '../components/TabPanel';
import { EngineCard } from './stock/EngineCard';
import type { ScreenProps } from '../App';
import type { Bar, SymbolInfo } from '../data/types';

/**
 * The price the still-demo decorations on this screen are computed from: the
 * open/high/low strip, the after-hours line, the day-change figure in
 * dollars, the derived rows in the key-stats grid.
 *
 * Those figures are demo whichever price they start from — the percentage
 * driving them is demo — so they are derived from the price actually on
 * screen, which keeps the panel internally consistent instead of showing a
 * real $144.76 above a change computed off the prototype's $182.44.
 *
 * It returns null rather than falling back to `x.demo.price`, and everything
 * built on it dashes out or disappears when it does. Caught by looking at the
 * rendered screen: XOM is not in the ranking, so its headline price was "—"
 * while the line underneath it still read "after hours $112.92" — a concrete
 * price on a page that had just said it had none. A number the reader cannot
 * reconcile with the one above it is worse than no number. The prototype
 * price is now rendered nowhere on this screen.
 */
const basisPrice = (x: SymbolInfo): number | null => x.quote?.price ?? null;

/** A derived demo figure, or the dash owed when there is no price to derive it from. */
const derived = (px: number | null, f: (p: number) => string): string => (px === null ? '—' : f(px));

/**
 * The windows a daily series can honestly draw, in trading sessions.
 *
 * There is deliberately no 1D. The chart is built on daily bars — one point
 * per session — so a day is a single dot, and a "1D" tab could only be filled
 * by inventing the intraday path between yesterday's close and today's. That
 * needs an intraday feed (see data/priceHistory.ts), not a narrower slice of
 * this one, so the tab is absent rather than present and lying.
 */
const TIMEFRAMES = [
  { key: '1W', sessions: 5 },
  { key: '1M', sessions: 22 },
  { key: '3M', sessions: 66 },
  { key: '1Y', sessions: 252 },
] as const;

type Timeframe = (typeof TIMEFRAMES)[number]['key'];

/** Sessions to show for a timeframe. */
const sessionsFor = (key: Timeframe): number => TIMEFRAMES.find((f) => f.key === key)?.sessions ?? 66;

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
  const toast = useToast();
  const beg = mode === 'beginner';
  // The sub-tab is scoped to its ticker AT RENDER TIME, not reset in an
  // effect: openStock can change the ticker while this screen stays mounted
  // (stock -> stock, from search or a news chip), and an effect-based reset
  // runs after commit — one render would still mount the old sub-tab's panel
  // for the NEW ticker and fire its data work before the reset landed.
  // Deriving the tab from a {ticker, tab} pair makes the very first render of
  // a new ticker land on 'overview' with no wasted fetch.
  const [tabFor, setTabFor] = useState<{ ticker: string; tab: StockTab }>({
    ticker: s.ticker,
    tab: 'overview',
  });
  const tab = tabFor.ticker === s.ticker ? tabFor.tab : 'overview';
  const setTab = (next: StockTab) => setTabFor({ ticker: s.ticker, tab: next });
  const [tf, setTf] = useState<Timeframe>('3M');
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });
  const sym = useLoadable(() => demoService.symbol(s.ticker), [s.ticker]);
  const inWl = s.watchlist.includes(s.ticker);
  const positions = useLoadable(
    () => fetchYourPositions(s.ticker, s.manualTransactions, s.manualPortfolios),
    [s.ticker, s.manualTransactions, s.manualPortfolios],
  );

  // REAL price history. Separate from `sym` on purpose: the row and the chart
  // come from different sources with different coverage, so a ticker can have
  // a price and no published history (or the reverse), and gating one on the
  // other would blank a panel that has data of its own.
  const history = useLoadable(() => demoService.dailySeries(s.ticker), [s.ticker]);
  // The published sessions, or null while loading / when there are none. The
  // key-stats grid reads them too, so the figures a bar can answer agree with
  // the chart drawn from the same bars.
  const seriesBars = history.state.status === 'ok' ? history.state.data : null;

  // The app's symbol table covers a handful of tickers. Any other symbol —
  // and the earnings calendar opens plenty of them — has no row here at all,
  // but its filings, news and ranking are live and per-ticker. Gating the
  // whole screen on that row turned "CRWD is not in our symbol list" into a
  // dead page, which is a worse answer than the one the data supports.
  // Distinct from a row that exists with `quote: null` — that ticker is
  // known, its price simply is not, and the full screen renders with "—".
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
              <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
                {moneyOrDash(x.quote?.price)}
              </Num>
              <Num size={17} style={{ color: signalColor(x.demo.changePct) }}>
                {`${derived(basisPrice(x), (px) => (x.demo.changePct >= 0 ? '+' : '') + ((px * x.demo.changePct) / 100).toFixed(2))} · ${pct(x.demo.changePct)}`}
              </Num>
            </div>
            {/* Dropped rather than dashed: "after hours —" is a line that
                says nothing, where the OHLC strip's dashes at least keep the
                labelled shape of a row the reader is scanning. */}
            {basisPrice(x) !== null && (
              <div className="text-muted" style={{ fontSize: 16, marginTop: 3 }}>
                {t('stock.afterHrs')} <Num>{money(basisPrice(x)! * 1.004)}</Num>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <Button
              variant="secondary"
              style={{
                flex: 1,
                minHeight: 40,
                fontSize: 17,
                ...(inWl
                  ? {
                      border: '1px solid var(--color-accent)',
                      background: 'var(--color-accent-900)',
                      color: 'var(--color-accent-200)',
                    }
                  : {}),
              }}
              onClick={() => {
                dispatch({ type: 'toggleWatch', ticker: s.ticker });
                toast(t(inWl ? 'toast.removed' : 'toast.added', { ticker: s.ticker }));
              }}
            >
              {inWl ? `✓ ${t('stock.inWatchlist')}` : `＋ ${t('stock.toWatchlist')}`}
            </Button>
            <Button style={{ flex: 1, minHeight: 40, fontSize: 17 }} onClick={() => openAlert(s.ticker)}>
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
                <Chip key={f.key} active={tf === f.key} onClick={() => setTf(f.key)}>
                  <Num>{f.key}</Num>
                </Chip>
              ))}
            </div>

            {/* The chart is the one panel on this screen that is entirely
                  real, so it gets its own honest states rather than borrowing
                  the row's: loading while the mirror is read, "unavailable"
                  with the reason when it cannot be, and a plain sentence when
                  the mirror simply publishes nothing for this symbol. None of
                  those draws a line. */}
            <DataState
              state={history.state}
              onRetry={history.retry}
              skeleton={<SkeletonCard height={beg ? 188 : 240} lines={2} />}
            >
              {(bars) => {
                const window = bars?.slice(-sessionsFor(tf)) ?? [];
                // A window with one bar in it has no line to draw and no
                // change to quote, so it is treated as no chart rather than
                // rendered as a dot.
                if (window.length < 2) {
                  return (
                    <Card padding={12} gap={0}>
                      <p className="text-muted" style={{ fontSize: 16, margin: 0, textAlign: 'center' }}>
                        {t('stock.noSeries')}
                      </p>
                    </Card>
                  );
                }
                const closes = window.map((b) => b.close);
                const last = window[window.length - 1];
                const windowPct = ((last.close - closes[0]) / closes[0]) * 100;

                return beg ? (
                  <Card padding={12} gap={0}>
                    <AreaChart values={closes} height={150} pad={8} />
                    <p style={{ fontSize: 16, lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85 }}>
                      {t('stock.chartHelp', { pct: pct(windowPct) })}
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
                    {/* The last session actually drawn, not four numbers
                          spun off the headline price. This strip used to read
                          O = price - 1.9, H = price + 2.4 and so on, which
                          described no day that ever traded. */}
                    <Num size={15} block style={{ color: 'var(--muted)' }}>
                      {`${last.date} · O ${last.open.toFixed(2)} H ${last.high.toFixed(2)} L ${last.low.toFixed(2)} C ${last.close.toFixed(2)}`}
                    </Num>
                    <CandleChart bars={window} showMA={ind.ma} showRSI={ind.rsi} showMACD={ind.macd} />
                  </Card>
                );
              }}
            </DataState>

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
                BEG_STATS(
                  x.quote?.price ?? null,
                  x.demo.marketCap,
                  seriesBars?.at(-1)?.volume ?? null,
                  x.demo.pe,
                ).map((row, i) => (
                  <div key={i} style={{ padding: '7px 0', borderTop: '1px solid var(--color-divider)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 17 }}>
                      <span>{row.k}</span>
                      <Num>{row.v}</Num>
                    </div>
                    <div className="text-muted" style={{ fontSize: 15.5, marginTop: 2 }}>
                      {row.help}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                  {ADV_STATS(x, seriesBars).map(([k, v], i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 15.5,
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
                <span style={{ fontSize: 19, fontFamily: 'var(--font-heading)' }}>
                  {t('stock.consensus')}
                </span>
                <span className="text-muted" style={{ fontSize: 15.5 }}>
                  {t('stock.analystMeta')}
                </span>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                <div style={{ flex: 31, background: 'var(--up)' }} />
                <div style={{ flex: 11, background: 'var(--acc-mid)' }} />
                <div style={{ flex: 8, background: 'var(--muted-2)' }} />
                <div style={{ flex: 3, background: 'var(--down)' }} />
              </div>
              <div className="text-muted" style={{ display: 'flex', gap: 9, fontSize: 15.5 }}>
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

const BEG_STATS = (price: number | null, mc: string, vol: number | null, pe: number) => [
  // Price and traded volume are real; market cap and P/E are still demo
  // stats, which is what <DemoDataNote /> at the top of the screen says.
  { k: 'Price', v: moneyOrDash(price), help: 'What one share costs right now' },
  { k: 'Company size', v: mc, help: 'Every share added together — market cap' },
  {
    k: 'Traded today',
    v: vol === null ? '—' : `${compactCount(vol)} shares`,
    help: 'How busy the stock is; high means lots of interest',
  },
  { k: 'Price vs earnings', v: `${pe.toFixed(1)}×`, help: 'Years of current profit to pay for the share' },
];

/**
 * Takes the whole symbol rather than loose numbers so the real figures and
 * the demo ones cannot be mixed up on the way in: `x.quote` is read for the
 * two rows that are real, `x.demo` for the rest.
 */
const ADV_STATS = (x: SymbolInfo, bars: Bar[] | null): Array<[string, string]> => {
  const { marketCap: mc, pe } = x.demo;
  const price = basisPrice(x);

  // The last two published sessions. Everything below that a daily bar can
  // answer is answered from them rather than spun off the headline price:
  // this grid used to read Open = price - 1.9 and Prev close = price * 0.99,
  // which put an "Open 231.85" directly beneath a chart strip reading
  // "O 232.80" for the same session. Two different opens on one screen is
  // worse than one missing one.
  const last = bars?.at(-1) ?? null;
  const prev = bars && bars.length > 1 ? bars[bars.length - 2] : null;
  const rsiNow = bars ? ([...rsi(bars.map((b) => b.close))].reverse().find((v) => v !== null) ?? null) : null;
  // Average volume over the published window, not a frozen "162.4M" that was
  // the same figure for every stock in the app.
  const avgVol = bars ? bars.reduce((a, b) => a + b.volume, 0) / bars.length : null;

  const or = (v: string | null) => v ?? '—';

  return [
    ['Open', or(last && last.open.toFixed(2))],
    ['Prev close', or(prev && prev.close.toFixed(2))],
    ['Day range', or(last && `${last.low.toFixed(2)}–${last.high.toFixed(2)}`)],
    // Real, from the mirror. The 52-week *low* is not in the payload, so the
    // row reports the high alone rather than pairing a real number with an
    // invented one to keep the old "range" shape.
    ['52w high', moneyOrDash(x.quote?.high52w)],
    ['Volume', or(last && compactCount(last.volume))],
    ['Avg vol', or(avgVol === null ? null : compactCount(avgVol))],
    ['Mkt cap', mc],
    ['P/E', pe.toFixed(1)],
    ['Fwd P/E', (pe * 0.62).toFixed(1)],
    ['EPS (ttm)', derived(price, (p) => (p / pe).toFixed(2))],
    ['Beta', '2.14'],
    ['Div yield', '0.02%'],
    ['Short float', '1.1%'],
    ['RSI(14)', or(rsiNow === null ? null : String(Math.round(rsiNow)))],
  ];
};

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
            style={{ fontSize: 15.5, letterSpacing: '.06em', textTransform: 'uppercase' }}
          >
            {month}
          </div>
          <Num size={20} style={{ fontFamily: 'var(--font-heading)' }}>
            {next.reportDate.slice(8)}
          </Num>
        </div>
        <p style={{ margin: 0, fontSize: 16, opacity: 0.8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
  const toast = useToast();
  const dispatch = useDispatch();
  const s = useAppState();
  const [tab, setTab] = useState<'reports' | 'news'>('reports');
  const inWl = s.watchlist.includes(ticker);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="text-muted" style={{ fontSize: 15.5, margin: 0, padding: '0 2px', lineHeight: 1.45 }}>
        {t('stock.noQuote')}
      </p>

      <Button
        variant="secondary"
        style={{
          minHeight: 40,
          fontSize: 17,
          ...(inWl
            ? {
                border: '1px solid var(--color-accent)',
                background: 'var(--color-accent-900)',
                color: 'var(--color-accent-200)',
              }
            : {}),
        }}
        onClick={() => {
          dispatch({ type: 'toggleWatch', ticker });
          toast(t(inWl ? 'toast.removed' : 'toast.added', { ticker }));
        }}
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
