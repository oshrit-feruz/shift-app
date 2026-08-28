/**
 * Pure crossing-detection logic for price alerts. Deliberately has no I/O —
 * the live feed and the state dispatch live elsewhere so this stays testable
 * without a WebSocket.
 *
 * "Crossing" (not "currently past") is the point: a stock that stays above a
 * rise-alert's threshold must fire once, not on every price tick that lands
 * above it. sideFor + didCross together give hysteresis — the caller tracks
 * the last known side per alert and only fires when the side actually flips
 * in the direction the alert cares about.
 */

export type Side = 'above' | 'below';

export function sideFor(price: number, threshold: number): Side {
  return price >= threshold ? 'above' : 'below';
}

/**
 * true only when the side just flipped in the direction the alert is for.
 * A null prevSide means this is the first price seen for the alert — there
 * is nothing to compare against, so it never fires on that first read (which
 * would otherwise fire immediately for every alert already past its
 * threshold at connect time).
 */
export function didCross(prevSide: Side | null, nextSide: Side, condition: 'rise' | 'fall'): boolean {
  if (prevSide === null || prevSide === nextSide) return false;
  return condition === 'rise' ? nextSide === 'above' : nextSide === 'below';
}
