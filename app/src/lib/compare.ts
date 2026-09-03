/**
 * Two strings as a comparator result, in code-unit order.
 *
 * Exists because the same three-way comparison was written inline in two
 * comparators as a nested ternary, and because the obvious shortcuts are both
 * wrong here: a bare `.sort()` is not a comparator at all, and
 * `localeCompare` orders by locale, which would make the same two rows sort
 * differently on two devices — the exact property the id tie-break exists to
 * guarantee.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
