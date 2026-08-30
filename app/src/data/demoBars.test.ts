import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoBars } from './demoBars';
import { fetchDailySeries } from './priceHistory';
import { withDemoData } from './demoFlagsStub';

const NOW = new Date('2026-08-28T09:00:00Z'); // a Friday

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demoBars', () => {
  it('is deterministic for a ticker', () => {
    expect(demoBars('NVDA', NOW)).toEqual(demoBars('NVDA', NOW));
  });

  it('is case-insensitive about the ticker', () => {
    expect(demoBars('nvda', NOW)).toEqual(demoBars('NVDA', NOW));
  });

  it('gives different symbols different series', () => {
    expect(demoBars('NVDA', NOW)[0].close).not.toBe(demoBars('AAPL', NOW)[0].close);
  });

  it('runs forward in time and skips weekends', () => {
    const bars = demoBars('NVDA', NOW);
    const dates = bars.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[dates.length - 1]).toBe('2026-08-28');
    for (const d of dates) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  it('produces bars whose high and low actually bracket open and close', () => {
    for (const b of demoBars('AMD', NOW)) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.low).toBeGreaterThan(0);
      expect(b.volume).toBeGreaterThan(0);
    }
  });
});

// The property that matters: generated price action is a mode the reader
// turns on, never a soft landing for a failed read. An outage stays an outage.
describe('generated bars are never a fallback', () => {
  it('reports unavailable when a read fails and demo mode is off', async () => {
    withDemoData(false);
    const failing = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    expect((await fetchDailySeries('NVDA', failing, NOW)).status).toBe('unavailable');
  });

  it('still reports unavailable on a failed read with demo mode on, for an injected fetch', async () => {
    // The short-circuit is scoped to the real fetch path, so a test that
    // asserts the mirror's own behaviour is never handed a generated series.
    withDemoData(true);
    const failing = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    expect((await fetchDailySeries('NVDA', failing, NOW)).status).toBe('unavailable');
  });
});

// A browser that throws on localStorage (Safari private mode, cookies
// blocked) used to leave the switch visibly on while the data layer kept
// reading false, so the chart never changed. The flag now holds in memory.
describe('the flag survives storage that throws', () => {
  it('still reads back what was set when localStorage is unusable', async () => {
    const { DEMO_FLAGS } = await import('./demoFlags');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    DEMO_FLAGS.set('demoData', true);
    expect(DEMO_FLAGS.demoData).toBe(true);
    DEMO_FLAGS.set('demoData', false);
    expect(DEMO_FLAGS.demoData).toBe(false);
  });
});
