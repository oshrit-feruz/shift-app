import { useState } from 'react';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Num } from '../../components/Num';
import { AreaChart } from '../../components/AreaChart';
import { CandleChart } from '../../components/CandleChart';
import { DataState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { useT } from '../../i18n/useT';
import { useDemoMode } from '../../lib/DemoModeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchIntradaySeries } from '../../data/intraday';
import { pct } from '../../lib/format';
import { loading, type Bar, type Loadable } from '../../data/types';

/**
 * The price chart and its timeframe row, for any ticker.
 *
 * Extracted from the stock screen so the two stock pages can share it. Until
 * they did, a chart existed only for the ten tickers in the app's sample
 * table: every other symbol — and the screener's ranking alone opens a
 * hundred of them — got a reduced page with no price action at all, because
 * that page was built when the sample table was the only source of anything.
 * The bars come from a route that serves any symbol, so the limit was ours
 * rather than the data's.
 *
 * The read stays with the caller: both pages want the same series for their
 * key-stats grid, and reading it once means the figures a bar can answer
 * agree with the chart drawn from the same bars.
 */

/**
 * The windows this chart draws, and which series each one reads.
 *
 * 1D IS A DIFFERENT SERIES, NOT A NARROWER SLICE. Everything from 1W out is
 * daily bars — one point per session — so a day was a single dot, and for a
 * long time the tab was simply absent: a "1D" drawn from daily bars could only
 * have been the invented path between yesterday's close and today's. It reads
 * /api/intraday now (data/intraday.ts), five minutes a bar, which is the real
 * path. That also makes it the only window here that moves while the page is
 * open — the reason it exists is that the live price in the header ticks while
 * a daily chart cannot.
 */
const TIMEFRAMES = [
  { key: '1D', sessions: 0 },
  { key: '1W', sessions: 5 },
  { key: '1M', sessions: 22 },
  { key: '3M', sessions: 66 },
  { key: '1Y', sessions: 252 },
] as const;

type Timeframe = (typeof TIMEFRAMES)[number]['key'];

/** The window a stock page opens on, and the one 1D falls back to when hidden. */
const DEFAULT_TIMEFRAME = '3M' as const satisfies Timeframe;

/** Sessions to show for a timeframe. Meaningless for 1D, which is one session. */
const sessionsFor = (key: Timeframe): number => TIMEFRAMES.find((f) => f.key === key)?.sessions ?? 66;

/**
 * The caption's stamp for one bar: the time of day intraday, the date daily.
 *
 * A daily bar is stamped YYYY-MM-DD and an intraday one with a full UTC
 * instant, so printing the raw field would put "2026-09-01T13:30:00Z" under a
 * chart. The time is rendered in the reader's own zone, which is what a clock
 * beside a price has to mean.
 */
function barStamp(date: string): string {
  if (!date.includes('T')) return date;
  const at = new Date(date);
  return Number.isNaN(at.getTime())
    ? date
    : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PriceChart({
  ticker,
  state,
  onRetry,
  beg,
}: Readonly<{
  ticker: string;
  state: Loadable<Bar[] | null>;
  onRetry: () => void;
  beg: boolean;
}>) {
  const t = useT();
  const demo = useDemoMode();
  const [tf, setTf] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });

  /**
   * 1D is offered only with sample data OFF, and that is not an oversight.
   *
   * The daily series behind every other window still draws a generated walk
   * when the switch is on (data/priceHistory.ts), while the intraday series
   * has a real source for any symbol and no demo branch at all. Offering both
   * under one row of chips would put a real session and an invented month
   * beside each other with nothing to tell them apart — worse than the tab
   * being absent. It comes back the moment the sample charts do.
   */
  const intradayOffered = !demo;
  /**
   * The timeframe actually in force.
   *
   * `tf` survives the sample-data switch being flipped, so someone on 1D who
   * turns sample data on would keep a selection whose chip has just
   * disappeared. That is not merely cosmetic: sessionsFor('1D') is 0 and
   * `slice(-0)` is `slice(0)`, so the chart would quietly draw the entire
   * daily history with no chip active. Falling back to the default window
   * keeps the picture and the chips agreeing.
   */
  const tfInForce: Timeframe = tf === '1D' && !intradayOffered ? DEFAULT_TIMEFRAME : tf;
  const showIntraday = tfInForce === '1D';
  // Read only while the tab is on screen: the route costs five credits a call,
  // so every stock page opened on 3M would otherwise pay for a session nobody
  // asked to see. No refresh interval — this was built expecting a series that
  // moves while someone watches it, and the feed measurably does not publish
  // the running day (see data/intraday.ts); polling would spend credits to
  // imply a line was moving when it cannot.
  const intraday = useLoadable(
    () => (showIntraday ? fetchIntradaySeries(ticker) : Promise.resolve(loading<Bar[] | null>())),
    [ticker, showIntraday],
  );
  const shown = showIntraday ? intraday.state : state;
  const retry = showIntraday ? intraday.retry : onRetry;

  return (
    <>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {TIMEFRAMES.filter((f) => f.key !== '1D' || intradayOffered).map((f) => (
          <Chip key={f.key} active={tfInForce === f.key} onClick={() => setTf(f.key)}>
            <Num>{f.key}</Num>
          </Chip>
        ))}
      </div>

      {/* The chart is entirely real, so it gets its own honest states rather
          than borrowing the symbol row's: loading while the route is read,
          "unavailable" with the reason when it cannot be, and a plain
          sentence when the provider simply publishes nothing for this
          symbol. None of those draws a line. */}
      {/* Which session the 1D tab is drawing, said rather than implied. The
          feed publishes the completed session, not the running one, so during
          market hours this is the previous day's path while the price in the
          header above ticks — the same gap the movers board carries, and the
          same sentence. */}
      {showIntraday && (
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, textAlign: 'center' }}>
          {t('movers.lastClose')}
        </p>
      )}

      <DataState state={shown} onRetry={retry} skeleton={<SkeletonCard height={beg ? 188 : 240} lines={2} />}>
        {(bars) => {
          // 1D is already exactly one session, so it is drawn whole; the daily
          // windows take their last N sessions.
          const window = (showIntraday ? bars : bars?.slice(-sessionsFor(tfInForce))) ?? [];
          // A window with one bar in it has no line to draw and no change to
          // quote, so it is treated as no chart rather than rendered as a dot.
          if (window.length < 2) {
            return (
              <Card padding={12} gap={0}>
                <p
                  className="text-muted"
                  style={{ fontSize: 'var(--text-body)', margin: 0, textAlign: 'center' }}
                >
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
              <p style={{ fontSize: 'var(--text-body)', lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85 }}>
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
              {/* The last session actually drawn, not four numbers spun off
                  the headline price. This strip used to read O = price - 1.9,
                  H = price + 2.4 and so on, which described no day that ever
                  traded. */}
              <Num size={15} block style={{ color: 'var(--muted)' }}>
                {`${barStamp(last.date)} · O ${last.open.toFixed(2)} H ${last.high.toFixed(2)} L ${last.low.toFixed(2)} C ${last.close.toFixed(2)}`}
              </Num>
              <CandleChart bars={window} showMA={ind.ma} showRSI={ind.rsi} showMACD={ind.macd} />
            </Card>
          );
        }}
      </DataState>
    </>
  );
}
