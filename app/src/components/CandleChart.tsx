import { useMemo } from 'react';
import {
  candlesFromBars,
  macdSeries,
  priceScale,
  rsi,
  sma,
  sparseLinePath,
  volumeBars,
  type Pt,
} from './charts';
import type { Bar } from '../data/types';

const W = 340;
const H = 170;
const VOL_H = 40;
const PANE_H = 52;

/**
 * Advanced-mode candlestick chart, drawn from real sessions.
 *
 * Every mark here corresponds to a trading day the mirror published: the
 * candle bodies are that day's open and close, the wicks its high and low, the
 * volume pane its traded shares, and the indicators are computed from the
 * closes on screen. The prototype this replaces derived all of it from a
 * seeded random walk — including a volume pane that was a fixed sawtooth —
 * which is precisely the kind of picture a reader cannot tell from a real one.
 *
 * Indicators start where their window fills rather than at the left edge, so
 * MA(50) is absent for the first fifty sessions instead of being the mean of
 * however many bars happened to precede it.
 */
export function CandleChart({
  bars,
  showMA,
  showRSI,
  showMACD,
}: {
  bars: Bar[];
  showMA: boolean;
  showRSI: boolean;
  showMACD: boolean;
}) {
  const step = W / bars.length;
  const barW = Math.max(1, Math.min(step * 0.7, 12));
  const at = (i: number) => i * step + step / 2;
  // RSI is defined on a fixed 0..100 scale, so its pane is scaled to that and
  // not to the values present — otherwise the 30 and 70 guide lines would sit
  // wherever the window happened to range, which is what made them decorative
  // before. The padding keeps a reading of exactly 0 or 100 inside the pane.
  const rsiY = (v: number) => PANE_H - 6 - (v / 100) * (PANE_H - 12);
  const mZero = PANE_H / 2;

  // Every derived series depends only on `bars`; a parent re-render (a
  // timeframe chip, an indicator toggle) must not redo the O(n·window) math.
  const { cs, vols, ma20, ma50, rsiPath, rsiNow, macd, signal, mMax } = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const scale = priceScale(bars, H - 4);
    const rsiVals = rsi(closes);
    const macdOut = macdSeries(closes);

    /** Map an indicator series onto the price pane, keeping its gaps. */
    const overPrice = (vals: Array<number | null>): Array<Pt | null> =>
      vals.map((v, i) => (v === null ? null : ([at(i), scale.yFor(v)] as Pt)));

    return {
      cs: candlesFromBars(bars, W, scale),
      vols: volumeBars(bars, W, VOL_H - 2),
      ma20: sparseLinePath(overPrice(sma(closes, 20))),
      ma50: sparseLinePath(overPrice(sma(closes, 50))),
      rsiPath: sparseLinePath(rsiVals.map((v, i) => (v === null ? null : ([at(i), rsiY(v)] as Pt)))),
      rsiNow: [...rsiVals].reverse().find((v) => v !== null) ?? null,
      macd: macdOut.macd,
      signal: macdOut.signal,
      // Both lines share one scale; 1e-6 only guards the divide for a window
      // in which MACD is flat at zero.
      mMax: Math.max(
        ...[...macdOut.macd, ...macdOut.signal].map((v) => (v === null ? 0 : Math.abs(v))),
        1e-6,
      ),
    };
    // step/at/rsiY are all derived from bars.length; bars is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  const mY = (v: number) => mZero - (v / mMax) * (PANE_H / 2 - 8);
  const mLine = (vals: Array<number | null>) =>
    sparseLinePath(vals.map((v, i) => (v === null ? null : ([at(i), mY(v)] as Pt))));

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[24, 60, 96, 132].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--grid)" />
        ))}
        {cs.map((c, i) => (
          <g key={i}>
            <line
              x1={c.x}
              y1={c.hy}
              x2={c.x}
              y2={c.ly}
              stroke={c.up ? 'var(--up)' : 'var(--down)'}
              strokeWidth="1"
            />
            <rect x={c.bx} y={c.by} width={c.bw} height={c.bh} fill={c.up ? 'var(--up)' : 'var(--down)'} />
          </g>
        ))}
        {showMA && (
          <g>
            <path d={ma20} fill="none" stroke="var(--acc-lite)" strokeWidth="1.1" />
            <path d={ma50} fill="none" stroke="var(--acc-dim)" strokeWidth="1.1" strokeDasharray="4 3" />
          </g>
        )}
      </svg>

      {/* Volume pane — real traded shares, scaled to the busiest session shown. */}
      <svg
        viewBox={`0 0 ${W} ${VOL_H}`}
        style={{ width: '100%', height: VOL_H }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {vols.map((v, i) => (
          <rect
            key={i}
            x={v.bx}
            y={v.y}
            width={v.bw}
            height={v.h}
            fill={v.up ? 'var(--up)' : 'var(--down)'}
            opacity=".5"
          />
        ))}
      </svg>

      {showRSI && (
        <svg
          viewBox={`0 0 ${W} ${PANE_H}`}
          style={{ width: '100%', height: PANE_H, borderTop: '1px solid var(--grid)' }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="0" y1={rsiY(70)} x2={W} y2={rsiY(70)} stroke="var(--line)" strokeDasharray="3 3" />
          <line x1="0" y1={rsiY(30)} x2={W} y2={rsiY(30)} stroke="var(--line)" strokeDasharray="3 3" />
          <path d={rsiPath} fill="none" stroke="var(--acc-pale)" strokeWidth="1.2" />
          <text x="3" y="10" fill="var(--muted)" fontSize="14">
            {/* Dashed rather than rounded-to-something when the window is too
                short to have a reading — a label is not the place to invent one. */}
            RSI(14) {rsiNow === null ? '—' : Math.round(rsiNow)}
          </text>
        </svg>
      )}

      {showMACD && (
        <svg
          viewBox={`0 0 ${W} ${PANE_H}`}
          style={{ width: '100%', height: PANE_H, borderTop: '1px solid var(--grid)' }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {macd.map((v, i) => {
            if (v === null) return null;
            const h = Math.abs(mY(v) - mZero);
            return (
              <rect
                key={i}
                x={at(i) - barW / 2}
                y={v >= 0 ? mZero - h : mZero}
                width={barW}
                height={Math.max(0.5, h)}
                fill={v >= 0 ? 'var(--up)' : 'var(--down)'}
                opacity=".65"
              />
            );
          })}
          <path d={mLine(macd)} fill="none" stroke="var(--acc-lite)" strokeWidth="1.1" />
          <path d={mLine(signal)} fill="none" stroke="var(--down)" strokeWidth="1.1" />
          <text x="3" y="10" fill="var(--muted)" fontSize="14">
            MACD(12,26,9)
          </text>
        </svg>
      )}
    </>
  );
}
