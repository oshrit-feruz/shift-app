import { useState } from 'react';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Num } from '../../components/Num';
import { AreaChart } from '../../components/AreaChart';
import { CandleChart } from '../../components/CandleChart';
import { DataState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { useT } from '../../i18n/useT';
import { pct } from '../../lib/format';
import type { Bar, Loadable } from '../../data/types';

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

export function PriceChart({
  state,
  onRetry,
  beg,
}: Readonly<{
  state: Loadable<Bar[] | null>;
  onRetry: () => void;
  beg: boolean;
}>) {
  const t = useT();
  const [tf, setTf] = useState<Timeframe>('3M');
  const [ind, setInd] = useState({ ma: true, rsi: true, macd: false });

  return (
    <>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {TIMEFRAMES.map((f) => (
          <Chip key={f.key} active={tf === f.key} onClick={() => setTf(f.key)}>
            <Num>{f.key}</Num>
          </Chip>
        ))}
      </div>

      {/* The chart is entirely real, so it gets its own honest states rather
          than borrowing the symbol row's: loading while the route is read,
          "unavailable" with the reason when it cannot be, and a plain
          sentence when the provider simply publishes nothing for this
          symbol. None of those draws a line. */}
      <DataState
        state={state}
        onRetry={onRetry}
        skeleton={<SkeletonCard height={beg ? 188 : 240} lines={2} />}
      >
        {(bars) => {
          const window = bars?.slice(-sessionsFor(tf)) ?? [];
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
                {`${last.date} · O ${last.open.toFixed(2)} H ${last.high.toFixed(2)} L ${last.low.toFixed(2)} C ${last.close.toFixed(2)}`}
              </Num>
              <CandleChart bars={window} showMA={ind.ma} showRSI={ind.rsi} showMACD={ind.macd} />
            </Card>
          );
        }}
      </DataState>
    </>
  );
}
