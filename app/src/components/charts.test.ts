import { describe, expect, it } from 'vitest';
import {
  candlesFromBars,
  ema,
  fit,
  macdSeries,
  priceScale,
  rsi,
  sma,
  sparseLinePath,
  volumeBars,
} from './charts';
import type { Bar } from '../data/types';

const bar = (over: Partial<Bar> & { close: number }): Bar => ({
  date: '2026-01-01',
  open: over.close,
  high: over.close,
  low: over.close,
  volume: 1,
  ...over,
});

describe('fit', () => {
  it('uses a supplied shared domain', () => {
    expect(fit([0, 10], 100, 100, 0, [0, 20])).toEqual([
      [0, 100],
      [100, 50],
    ]);
  });
});

describe('sma', () => {
  it('is null until the window has filled, then the mean of exactly n values', () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  // The whole reason sma returns nulls: a partial average rendered under an
  // "MA(50)" label is a different, smoother indicator wearing its name.
  it('never averages fewer values than the window asks for', () => {
    expect(sma([10, 20], 5)).toEqual([null, null]);
  });
});

describe('ema', () => {
  it('seeds with the first full simple average', () => {
    const out = ema([1, 2, 3, 4], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 10);
    // 4 * 0.5 + 2 * 0.5
    expect(out[3]).toBeCloseTo(3, 10);
  });
});

describe('rsi', () => {
  // Wilder's published worked example. Reference tables round their inputs, so
  // these agree to about a tenth rather than exactly; the shape and level are
  // what this pins down. Before this change the function returned
  // `50 + (close - ma12) * 3.6`, which matches nothing here at all.
  const WILDER = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18,
  ];
  const EXPECTED = [
    70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46,
  ];

  it('matches the published worked example', () => {
    const out = rsi(WILDER);
    EXPECTED.forEach((want, i) => {
      const got = out[14 + i];
      expect(got).not.toBeNull();
      expect(Math.abs((got as number) - want)).toBeLessThan(0.1);
    });
  });

  it('has no reading until a full period of changes exists', () => {
    const out = rsi(WILDER);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(out[14]).not.toBeNull();
  });

  it('returns nothing at all for a window shorter than the period', () => {
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });

  // The old formula was unbounded, which is what made the 30 and 70 guide
  // lines drawn across the pane meaningless.
  it('stays within 0..100, and pins to 100 for a series that only rises', () => {
    const rising = Array.from({ length: 40 }, (_, i) => 10 + i);
    const falling = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(rising).at(-1)).toBe(100);
    expect(rsi(falling).at(-1)).toBeCloseTo(0, 10);
    for (const v of [...rsi(WILDER), ...rsi(rising), ...rsi(falling)]) {
      if (v !== null) (expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100));
    }
  });
});

describe('macdSeries', () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 8);

  it('starts where the slow average does, and the signal starts later still', () => {
    const { macd, signal } = macdSeries(closes);
    // ema(26) has its first value at index 25.
    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
    // The signal is a 9-period EMA of the MACD line, so it needs 9 of those.
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
  });

  it('does not feed the leading nulls into the signal line as zeroes', () => {
    const { macd, signal } = macdSeries(closes);
    // Seeded on the MACD line's own first nine values, the signal starts at
    // their mean. Averaging in 25 leading zeroes instead would drag it toward
    // zero and shift every later value with it.
    const firstNine = (macd.slice(25, 34) as number[]).reduce((a, b) => a + b, 0) / 9;
    expect(signal[33]).toBeCloseTo(firstNine, 10);
  });
});

describe('priceScale', () => {
  it('spans the bars own highs and lows, whatever the price level', () => {
    const cheap = priceScale([bar({ close: 18, low: 17, high: 19 })], 100);
    expect(cheap.lo).toBe(17);
    expect(cheap.hi).toBe(19);
  });

  it('survives a window in which nothing moved', () => {
    const flat = priceScale([bar({ close: 50 }), bar({ close: 50 })], 100);
    expect(Number.isFinite(flat.yFor(50))).toBe(true);
  });
});

describe('candlesFromBars', () => {
  it('draws each candle from its own session, not from the previous close', () => {
    const bars: Bar[] = [
      { date: '2026-01-01', open: 10, high: 12, low: 9, close: 11, volume: 5 },
      // Opens BELOW the previous close and still closes up on the day: a
      // close-only chart would have drawn this candle red.
      { date: '2026-01-02', open: 10.5, high: 13, low: 10, close: 12, volume: 5 },
    ];
    const scale = priceScale(bars, 100);
    const cs = candlesFromBars(bars, 200, scale);
    expect(cs[1].up).toBe(true);
    // The wick spans this session's own high and low.
    expect(cs[1].hy).toBeCloseTo(scale.yFor(13), 10);
    expect(cs[1].ly).toBeCloseTo(scale.yFor(10), 10);
  });

  it('keeps a doji visible', () => {
    const bars = [bar({ close: 10, open: 10, high: 11, low: 9 })];
    expect(candlesFromBars(bars, 100, priceScale(bars, 100))[0].bh).toBeGreaterThan(0);
  });
});

describe('volumeBars', () => {
  it('scales to the busiest session shown', () => {
    const bars = [bar({ close: 1, volume: 50 }), bar({ close: 1, volume: 100 })];
    const vs = volumeBars(bars, 100, 40);
    expect(vs[1].h).toBeCloseTo(40, 10);
    expect(vs[0].h).toBeCloseTo(20, 10);
  });
});

describe('sparseLinePath', () => {
  it('breaks the stroke rather than joining across a gap', () => {
    const d = sparseLinePath([[0, 0], null, [2, 2], [3, 3]]);
    // Two subpaths: one point, then the pair after the gap.
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('is empty when nothing has a value yet', () => {
    expect(sparseLinePath([null, null])).toBe('');
  });
});
