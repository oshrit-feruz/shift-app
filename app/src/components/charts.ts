/** Pure chart math: SVG geometry, and the indicators drawn on real bars. */

import type { Bar } from '../data/types';

export type Pt = [number, number];

/** Scale a series of values into 2D points that fit within the given width and height, with optional padding and domain override. */
export function fit(vals: number[], w: number, h: number, pad = 6, domain?: readonly [number, number]): Pt[] {
  const lo = domain?.[0] ?? Math.min(...vals);
  const hi = domain?.[1] ?? Math.max(...vals);
  const sp = hi - lo || 1;
  return vals.map((v, i) => [i * (w / (vals.length - 1)), h - pad - ((v - lo) / sp) * (h - pad * 2)]);
}

/** Convert a series of points into an SVG path string for a line chart. */
export function linePath(pts: Pt[]): string {
  return pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
}

/**
 * A line through a series with gaps in it, drawn as separate strokes.
 *
 * Indicators do not exist before their window has filled — MA(50) has no value
 * on day three — so their series carry nulls at the start, and any later gap
 * is a session the data genuinely does not cover. Joining across a null would
 * draw a straight segment through the gap, which reads as a real, calm stretch
 * of the indicator rather than as the absence it is. Each run of real values
 * therefore becomes its own subpath.
 */
export function sparseLinePath(pts: Array<Pt | null>): string {
  const parts: string[] = [];
  let open = false;
  for (const p of pts) {
    if (!p) {
      open = false;
      continue;
    }
    parts.push((open ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1));
    open = true;
  }
  return parts.join(' ');
}

/**
 * `fit` for a series with gaps: nulls keep their slot on the x axis and come
 * back as nulls, so a missing day occupies the width it really spans instead
 * of closing up and shifting every later point left.
 *
 * The domain is taken from the real values only — a null is not a low.
 */
export function fitSparse(
  vals: Array<number | null>,
  w: number,
  h: number,
  pad = 6,
  domain?: readonly [number, number],
): Array<Pt | null> {
  const real = vals.filter((v): v is number => v !== null);
  if (real.length === 0) return vals.map(() => null);
  const lo = domain?.[0] ?? Math.min(...real);
  const hi = domain?.[1] ?? Math.max(...real);
  const sp = hi - lo || 1;
  // A single point has no span to divide across, and w/0 would place it at
  // NaN rather than anywhere on the chart.
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  return vals.map((v, i) => (v === null ? null : [i * step, h - pad - ((v - lo) / sp) * (h - pad * 2)]));
}

/**
 * The filled area under a series with gaps, as one closed shape per run.
 *
 * Each run closes down to the baseline beneath its own first and last points
 * rather than at x=0, so the fill ends where the data does. A single isolated
 * point is left unfilled: there is no area under one sample, and drawing a
 * hairline there would read as a spike.
 */
export function sparseAreaPath(pts: Array<Pt | null>, h: number): string {
  const parts: string[] = [];
  let run: Pt[] = [];
  const flush = () => {
    if (run.length > 1) {
      const first = run[0];
      const last = run[run.length - 1];
      parts.push(`${linePath(run)} L${last[0].toFixed(1)} ${h} L${first[0].toFixed(1)} ${h} Z`);
    }
    run = [];
  };
  for (const p of pts) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  return parts.join(' ');
}

/** Convert a series of points into an SVG path string for an area chart, closing the path at the given height. */
export function areaPath(pts: Pt[], h: number): string {
  return linePath(pts) + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L0 ${h} Z`;
}

/**
 * Simple moving average, null until the window has filled.
 *
 * The nulls are the point. Averaging whatever happens to be available at the
 * left edge produces a line that is labelled MA(50) while being the mean of
 * three sessions — visibly wrong to anyone who reads it as the indicator it
 * claims to be, and wrong in the direction of looking smoother and more
 * settled than the data supports.
 */
export function sma(vals: number[], n: number): Array<number | null> {
  let sum = 0;
  return vals.map((v, i) => {
    sum += v;
    if (i >= n) sum -= vals[i - n];
    return i >= n - 1 ? sum / n : null;
  });
}

/**
 * Exponential moving average, seeded with the first full simple average and
 * null before it — the standard construction, and what MACD is defined on.
 */
export function ema(vals: number[], n: number): Array<number | null> {
  const k = 2 / (n + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i < n - 1) {
      out.push(null);
    } else if (i === n - 1) {
      prev = sum / n;
      out.push(prev);
    } else {
      prev = vals[i] * k + (prev as number) * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export interface Candle {
  x: number;
  bx: number;
  bw: number;
  by: number;
  bh: number;
  hy: number;
  ly: number;
  up: boolean;
}

/** Maps a price to a y coordinate inside a chart pane. */
export interface PriceScale {
  yFor: (v: number) => number;
  lo: number;
  hi: number;
}

/**
 * The vertical scale for a set of bars, taken from their real highs and lows.
 *
 * The prototype padded a fixed ±4 around the close series, which silently
 * assumed every stock trades near $100: on TEVA at $18 that pads by a fifth of
 * the price and flattens the chart, and on LLY at $740 it is invisible. The
 * padding here is a fraction of the range the window actually covers.
 */
export function priceScale(bars: Bar[], h: number, pad = 4): PriceScale {
  const lo = Math.min(...bars.map((b) => b.low));
  const hi = Math.max(...bars.map((b) => b.high));
  // A window in which nothing moved still needs a non-zero span to divide by.
  const span = hi - lo || Math.abs(hi) * 0.01 || 1;
  return {
    lo,
    hi,
    yFor: (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2),
  };
}

/**
 * Candle geometry from real bars.
 *
 * Each candle is the session it is drawn from: the body spans that session's
 * own open and close, and the wick spans its own high and low. The prototype
 * derived all four from the close series — open was yesterday's close, and the
 * wicks were a fixed ±1.6 — which drew a plausible-looking chart in which no
 * candle corresponded to a real day's trading.
 */
export function candlesFromBars(bars: Bar[], w: number, scale: PriceScale): Candle[] {
  const step = w / bars.length;
  const bw = Math.max(1, Math.min(step * 0.7, 12));
  return bars.map((b, i) => {
    const up = b.close >= b.open;
    const top = scale.yFor(Math.max(b.open, b.close));
    const bottom = scale.yFor(Math.min(b.open, b.close));
    const x = i * step + step / 2;
    return {
      x,
      bx: x - bw / 2,
      bw,
      by: top,
      // A doji — open and close equal — has no body height at all, and would
      // vanish entirely without a floor.
      bh: Math.max(0.8, bottom - top),
      hy: scale.yFor(b.high),
      ly: scale.yFor(b.low),
      up,
    };
  });
}

export interface VolumeBar {
  bx: number;
  bw: number;
  y: number;
  h: number;
  up: boolean;
}

/**
 * Volume geometry, scaled to the busiest session in the window.
 *
 * The prototype's volume pane was `8 + ((i * 37) % 26)` — a sawtooth that
 * repeated every 26 candles regardless of the stock. This is the traded
 * share count, and its colour is the session's own direction.
 */
export function volumeBars(bars: Bar[], w: number, h: number): VolumeBar[] {
  const step = w / bars.length;
  const bw = Math.max(1, Math.min(step * 0.7, 12));
  const max = Math.max(...bars.map((b) => b.volume), 1);
  return bars.map((b, i) => {
    const barH = Math.max(0.5, (b.volume / max) * h);
    return { bx: i * step + step / 2 - bw / 2, bw, y: h - barH, h: barH, up: b.close >= b.open };
  });
}

/**
 * Wilder's RSI — the actual indicator, null until it has a full period.
 *
 * What stood here was `50 + (close - ma12) * 3.6`, which is not RSI by any
 * definition: it is unbounded (RSI cannot leave 0..100), it has no notion of
 * gains versus losses, and its scale depended on the stock's price, so the
 * same 3.6 multiplier that gave a plausible wiggle on a $180 chip maker pinned
 * a $18 stock to the middle of the pane forever. The overbought and oversold
 * lines drawn across that pane were therefore decoration. They now mean what
 * they are labelled.
 */
export function rsi(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;
  // All-gain windows have no loss to divide by; the indicator's limit there is
  // 100, and it is a real reading rather than a missing one.
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/**
 * MACD(12, 26, 9) on exponential averages, as the indicator is defined.
 *
 * The prototype used simple averages and computed the signal line over a
 * series that included the pre-window nulls as zeroes, so both lines were
 * shifted and damped. Here the signal is the 9-period EMA of the MACD line
 * itself, starting where the MACD line does.
 */
export function macdSeries(closes: number[]): {
  macd: Array<number | null>;
  signal: Array<number | null>;
} {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null ? null : f - s;
  });

  // The signal EMA runs over the MACD line's real values only, then is mapped
  // back onto the original indices — feeding the leading nulls in as zeroes
  // would drag the first several sessions of the signal line toward zero.
  const firstReal = macd.findIndex((v) => v !== null);
  const signal: Array<number | null> = new Array(closes.length).fill(null);
  if (firstReal !== -1) {
    const dense = macd.slice(firstReal) as number[];
    ema(dense, 9).forEach((v, i) => {
      signal[firstReal + i] = v;
    });
  }
  return { macd, signal };
}
