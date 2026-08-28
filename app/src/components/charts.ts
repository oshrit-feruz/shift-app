/** Pure chart math, ported from the prototype — seeded walks and SVG paths. */

export type Pt = [number, number];

export function fit(vals: number[], w: number, h: number, pad = 6, domain?: readonly [number, number]): Pt[] {
  const lo = domain?.[0] ?? Math.min(...vals);
  const hi = domain?.[1] ?? Math.max(...vals);
  const sp = hi - lo || 1;
  return vals.map((v, i) => [i * (w / (vals.length - 1)), h - pad - ((v - lo) / sp) * (h - pad * 2)]);
}

export function linePath(pts: Pt[]): string {
  return pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
}

export function areaPath(pts: Pt[], h: number): string {
  return linePath(pts) + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L0 ${h} Z`;
}

/** Trailing moving average. */
export function ma(vals: number[], n: number): number[] {
  return vals.map((_, i) => {
    const s = Math.max(0, i - n + 1);
    const sl = vals.slice(s, i + 1);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
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

/** Build candle geometry from a close series (prototype-identical). */
export function candles(closes: number[], w: number, h: number): Candle[] {
  const n = closes.length;
  const lo = Math.min(...closes) - 4;
  const hi = Math.max(...closes) + 4;
  const sp = hi - lo;
  const yFor = (v: number) => h - 4 - ((v - lo) / sp) * (h - 8);
  const step = w / n;
  const bw = Math.max(2.6, step * 0.55);
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c - 1;
    const up = c >= o;
    const hh = Math.max(o, c) + 1.6;
    const ll = Math.min(o, c) - 1.6;
    const by = yFor(Math.max(o, c));
    const bh = Math.max(1.2, yFor(Math.min(o, c)) - by);
    const x = i * step + step / 2;
    return { x, bx: x - bw / 2, bw, by, bh, hy: yFor(hh), ly: yFor(ll), up };
  });
}

export function rsiSeries(closes: number[]): number[] {
  const m = ma(closes, 12);
  return closes.map((c, i) => 50 + (c - (m[i] ?? c)) * 3.6);
}

export function macdSeries(closes: number[]): { macd: number[]; signal: number[] } {
  const m12 = ma(closes, 12);
  const m26 = ma(closes, 26);
  const macd = closes.map((c, i) => (m12[i] ?? c) - (m26[i] ?? c));
  return { macd, signal: ma(macd, 9) };
}
