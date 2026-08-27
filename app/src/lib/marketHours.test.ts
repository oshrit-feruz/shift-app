import { describe, expect, it } from 'vitest';
import { marketSession } from './marketHours';

/** UTC instants, chosen against the ET wall clock they correspond to. */
describe('marketSession', () => {
  it('is open inside the regular weekday session', () => {
    // Thu 2026-08-27, 10:00 ET (EDT, UTC-4) => 14:00 UTC
    expect(marketSession(new Date('2026-08-27T14:00:00Z'))).toBe('open');
    // Thu 2026-08-27, 15:59 ET => 19:59 UTC
    expect(marketSession(new Date('2026-08-27T19:59:00Z'))).toBe('open');
  });

  it('is closed before the open and at/after the close', () => {
    // 09:29 ET => 13:29 UTC
    expect(marketSession(new Date('2026-08-27T13:29:00Z'))).toBe('closed');
    // 09:30 ET exactly => open
    expect(marketSession(new Date('2026-08-27T13:30:00Z'))).toBe('open');
    // 16:00 ET exactly => closed (the bell, not a minute of trading)
    expect(marketSession(new Date('2026-08-27T20:00:00Z'))).toBe('closed');
    // 17:00 ET — the case that prompted this: an hour after the close
    expect(marketSession(new Date('2026-08-27T21:00:00Z'))).toBe('closed');
  });

  it('is closed all weekend', () => {
    // Sat 2026-08-29 and Sun 2026-08-30, both midday ET
    expect(marketSession(new Date('2026-08-29T16:00:00Z'))).toBe('closed');
    expect(marketSession(new Date('2026-08-30T16:00:00Z'))).toBe('closed');
  });

  it('tracks the ET wall clock across the DST boundary, not a fixed offset', () => {
    // In January, ET is EST (UTC-5), so 10:00 ET is 15:00 UTC — the same
    // 14:00 UTC instant that is mid-session in August is 09:00 ET here,
    // before the open.
    expect(marketSession(new Date('2026-01-15T14:00:00Z'))).toBe('closed');
    expect(marketSession(new Date('2026-01-15T15:00:00Z'))).toBe('open');
  });
});
