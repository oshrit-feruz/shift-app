import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { DataState } from '../components/DataState';
import { DemoOnly } from '../components/DemoOnly';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { PRICE_REFRESH_MS } from '../data/quotes';
import { fetchTickerEarnings } from '../data/earnings';
import { fetchStockStats } from '../data/stats';
import { useDemoMode } from '../lib/DemoModeProvider';
import { ReportsTab, EarningsHistory } from './stock/ReportsTab';
import { FinancialStatements } from './stock/FinancialStatements';
import { NewsTab } from './stock/NewsTab';
import { TabPanel } from '../components/TabPanel';
import { EngineCard } from './stock/EngineCard';
import { PriceChart } from './stock/PriceChart';
import { KeyStats } from './stock/KeyStats';
import { YourHoldings } from './stock/YourHoldings';
import { PriceHeader } from './stock/PriceHeader';
import type { ScreenProps } from '../App';

// A NOTE ABOUT THIS WHOLE FILE, not about what follows it: no price on this
// screen is ever derived from another one. Everything built on the live price
// dashes out or disappears when there is none. Caught by looking at the
// rendered screen — a symbol with no price had a headline of "—" while the
// line underneath it still read "after hours $112.92", a concrete price on a
// page that had just said it had none, and a number the reader cannot
// reconcile with the one above it is worse than no number. That after-hours
// line is gone (it was the last price multiplied by 1.004), the prototype
// price is rendered nowhere, and the key-stats grid no longer divides a price
// by a P/E to publish an EPS. The `basisPrice` helper that used to carry this
// note went with that EPS.

type StockTab = 'overview' | 'reports' | 'news';

/**
 * A single ticker's page: live price and day change, watchlist/alert
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
 *
 * The price header, the chart, the holdings card and the key-stats grid are
 * components in ./stock/ rather than markup here, because LiveOnlyStock at
 * the bottom of this file renders exactly the same four. Everything they
 * read answers per ticker, so the only thing this page still has that the
 * other does not is the sample table's own prose and the analyst card.
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
  // In the useLoadable deps below, so turning sample data on or off redraws
  // the chart at once instead of on the next visit to this ticker.
  const demo = useDemoMode();
  const sym = useLoadable(() => demoService.symbol(s.ticker), [s.ticker], PRICE_REFRESH_MS);
  const inWl = s.watchlist.includes(s.ticker);

  // REAL price history. Separate from `sym` on purpose: the row and the chart
  // come from different sources with different coverage, so a ticker can have
  // a price and no published history (or the reverse), and gating one on the
  // other would blank a panel that has data of its own.
  const history = useLoadable(() => demoService.dailySeries(s.ticker), [s.ticker, demo]);
  // The published sessions, or null while loading / when there are none. The
  // key-stats grid reads them too, so the figures a bar can answer agree with
  // the chart drawn from the same bars.
  const seriesBars = history.state.status === 'ok' ? history.state.data : null;

  // REAL key statistics, per ticker. Not gated on `demo` the way the history
  // above is: these have a live source now, so they are read in either
  // position of the sample-data switch, exactly like the price. Null while
  // loading, and null for a ticker the provider carries no extended quote for
  // — every non-US listing — which the grid renders as "—".
  const statsRead = useLoadable(() => fetchStockStats(s.ticker), [s.ticker]);
  const stats = statsRead.state.status === 'ok' ? statsRead.state.data : null;

  // The app's symbol table covers a handful of tickers. Any other symbol —
  // and the earnings calendar opens plenty of them — has no row here at all,
  // but its filings, news and ranking are live and per-ticker. Gating the
  // whole screen on that row turned "CRWD is not in our symbol list" into a
  // dead page, which is a worse answer than the one the data supports.
  // Distinct from a row that exists with `quote: null` — that ticker is
  // known, its price simply is not, and the full screen renders with "—".
  if (sym.state.status === 'unavailable') {
    return <LiveOnlyStock ticker={s.ticker} openAlert={openAlert} />;
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
          <PriceHeader quote={x.quote} />

          <div style={{ display: 'flex', gap: 7 }}>
            <Button
              variant="secondary"
              style={{
                flex: 1,
                minHeight: 40,
                fontSize: 'var(--text-row)',
                ...(inWl
                  ? {
                      border: '1px solid var(--color-accent)',
                      background: 'var(--fill-selected)',
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
            <Button
              style={{ flex: 1, minHeight: 40, fontSize: 'var(--text-row)' }}
              onClick={() => openAlert(s.ticker)}
            >
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
            <PriceChart ticker={s.ticker} state={history.state} onRetry={history.retry} beg={beg} />

            <YourHoldings ticker={s.ticker} />

            <KeyStats quote={x.quote} bars={seriesBars} stats={stats} beg={beg} />

            {/* Shown in both modes: the ratings bar and counts are already
              plain-language, so there was no beginner-specific reason to
              hide analyst sentiment from that mode. */}
            {demo ? (
              <Card padding={12} gap={7}>
                <CardTitle>{t('stock.analyst')}</CardTitle>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 'var(--text-title)', fontFamily: 'var(--font-heading)' }}>
                    {t('stock.consensus')}
                  </span>
                  <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
                    {t('stock.analystMeta')}
                  </span>
                </div>
                <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                  <div style={{ flex: 31, background: 'var(--up)' }} />
                  <div style={{ flex: 11, background: 'var(--acc-mid)' }} />
                  <div style={{ flex: 8, background: 'var(--muted-2)' }} />
                  <div style={{ flex: 3, background: 'var(--down)' }} />
                </div>
                <div
                  className="text-muted"
                  style={{ display: 'flex', gap: 9, fontSize: 'var(--text-caption)' }}
                >
                  <span>{t('stock.rateSb')}</span>
                  <span>{t('stock.rateB')}</span>
                  <span>{t('stock.rateH')}</span>
                  <span>{t('stock.rateS')}</span>
                </div>
              </Card>
            ) : (
              // Ratings, price target and the 31/11/8/3 bar are all literals —
              // there is no analyst feed behind this card at all.
              <DemoOnly feature="stock.analyst" />
            )}

            <NextEarnings ticker={s.ticker} />

            {/* The engine's own view, from the mirrored daily ranking. Kept as
              its own card rather than folded into the header because most
              tickers are not in a 100-name ranking, and "not covered" is a
              real answer that needs room to say so. */}
            <EngineCard ticker={s.ticker} />
          </TabPanel>

          <TabPanel key={`re-${s.ticker}`} active={tab === 'reports'}>
            <ReportsTab ticker={s.ticker} />
            <FinancialStatements ticker={s.ticker} />
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
  const demo = useDemoMode();
  const t = useT();
  const { language } = useTheme();
  const e = useLoadable(() => fetchTickerEarnings(ticker), [ticker, demo]);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 50,
            textAlign: 'center',
            padding: '6px 0',
            borderRadius: 'var(--radius-md)',
            background: 'var(--fill-selected)',
            flex: 'none',
          }}
        >
          <div
            className="text-muted"
            style={{ fontSize: 'var(--text-caption)', letterSpacing: '.06em', textTransform: 'uppercase' }}
          >
            {month}
          </div>
          <Num size={20} style={{ fontFamily: 'var(--font-heading)' }}>
            {next.reportDate.slice(8)}
          </Num>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-body)',
            opacity: 0.8,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
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
 * A ticker the app's sample table has never heard of — which is most of them.
 *
 * The sample table carries ten rows, so anything else (the screener alone
 * ranks a hundred names, and the earnings calendar opens thousands) used to
 * land on a stub: no price, no chart, no statistics, no holdings. That was a
 * limit of the table rather than of the data, and it stopped being true once
 * every source on the page became per-ticker. The quote, the daily bars, the
 * key statistics, the reader's own position and the filings behind them all
 * answer for any symbol, so this page now shows them.
 *
 * What it still does not carry is the sample table's own prose — the
 * beginner-mode "what this company does" line — and the analyst card, which
 * has no feed behind it on this plan. Neither is worth a warning: a page that
 * apologises for the absence of a sentence reads worse than one that simply
 * does not print it.
 */
function LiveOnlyStock({ ticker, openAlert }: Readonly<{ ticker: string; openAlert: (t: string) => void }>) {
  const t = useT();
  const toast = useToast();
  const dispatch = useDispatch();
  const s = useAppState();
  const { mode } = useTheme();
  const beg = mode === 'beginner';
  const demo = useDemoMode();
  // Scoped to the ticker, for the same reason StockScreen's is (see there).
  // This component stays mounted when `openStock` changes the ticker — it is
  // rendered from the same position — so plain state would survive the change:
  // open an unknown ticker, select News, then open another from a news chip,
  // and you would land on the new symbol's News panel rather than its
  // Overview, with that panel mounting and fetching immediately.
  const [tabFor, setTabFor] = useState<{ ticker: string; tab: StockTab }>({ ticker, tab: 'overview' });
  const tab = tabFor.ticker === ticker ? tabFor.tab : 'overview';
  const setTab = (next: StockTab) => setTabFor({ ticker, tab: next });
  const inWl = s.watchlist.includes(ticker);

  // The row the sample table could not provide, built from the live quote
  // alone. watchRows describes any ticker by what is actually known about it
  // rather than gating on that table, which is exactly the shape this page
  // needs — a name when there is one, and a real price either way.
  const row = useLoadable(() => demoService.watchRows([ticker]), [ticker], PRICE_REFRESH_MS);
  const quote = row.state.status === 'ok' ? (row.state.data[0]?.quote ?? null) : null;

  const history = useLoadable(() => demoService.dailySeries(ticker), [ticker, demo]);
  const seriesBars = history.state.status === 'ok' ? history.state.data : null;
  const statsRead = useLoadable(() => fetchStockStats(ticker), [ticker]);
  const stats = statsRead.state.status === 'ok' ? statsRead.state.data : null;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PriceHeader quote={quote} />

      <div style={{ display: 'flex', gap: 7 }}>
        <Button
          variant="secondary"
          style={{
            flex: 1,
            minHeight: 40,
            fontSize: 'var(--text-row)',
            ...(inWl
              ? {
                  border: '1px solid var(--color-accent)',
                  background: 'var(--fill-selected)',
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
        <Button
          style={{ flex: 1, minHeight: 40, fontSize: 'var(--text-row)' }}
          onClick={() => openAlert(ticker)}
        >
          <Icon name="bell" size={14} strokeWidth={1.8} />
          {t('stock.addAlert')}
        </Button>
      </div>

      <SegmentedControl<StockTab>
        options={[
          { value: 'overview', label: t('stock.tabOverview') },
          { value: 'reports', label: t('stock.tabReports') },
          { value: 'news', label: t('stock.tabNews') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel key={`ov-${ticker}`} active={tab === 'overview'}>
        <PriceChart ticker={ticker} state={history.state} onRetry={history.retry} beg={beg} />
        <YourHoldings ticker={ticker} />
        <KeyStats quote={quote} bars={seriesBars} stats={stats} beg={beg} />
        <EngineCard ticker={ticker} />
      </TabPanel>
      <TabPanel key={`re-${ticker}`} active={tab === 'reports'}>
        <NextEarnings ticker={ticker} />
        <ReportsTab ticker={ticker} />
        <FinancialStatements ticker={ticker} />
        <EarningsHistory ticker={ticker} />
      </TabPanel>
      <TabPanel key={`ne-${ticker}`} active={tab === 'news'}>
        <NewsTab ticker={ticker} />
      </TabPanel>
    </div>
  );
}
