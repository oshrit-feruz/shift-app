/**
 * US regular-session clock, used to explain an absent live price rather than
 * leave the UI claiming it is still "connecting".
 *
 * The Alpaca IEX stream only emits on actual trades, so a connected, fully
 * authenticated socket produces nothing at all when the market is shut. That
 * is the normal overnight state, not a fault, and it needs to read that way.
 */

export type MarketSession = 'open' | 'closed';

/**
 * Whether the US regular equity session (09:30–16:00 America/New_York,
 * Monday–Friday) is running at `at`.
 *
 * Computed from the ET wall clock via Intl, not from a fixed UTC offset, so
 * the EDT/EST switch is handled without a DST table of our own.
 *
 * Deliberately does NOT know about market holidays — Thanksgiving reads as
 * 'open' here. A hard-coded holiday table silently rots a year after it is
 * written, and the cost of being wrong in that direction is only a vaguer
 * message ("waiting for the first trade" instead of "market closed"), never
 * a wrong price or a missed alert. Callers must treat 'open' as "the market
 * is probably open", not as a guarantee.
 */
export function marketSession(at: Date): MarketSession {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const weekday = part('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return 'closed';

  // hour12:false can render midnight as "24" in some ICU versions.
  const hour = Number(part('hour')) % 24;
  const minutes = hour * 60 + Number(part('minute'));
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60 ? 'open' : 'closed';
}
