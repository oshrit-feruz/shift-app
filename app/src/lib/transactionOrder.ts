import { compareStrings } from './compare';
import type { ManualTransaction } from '../state/appState';

/**
 * Newest first: the row someone is most likely to have mistyped is the one
 * they just entered, so it belongs at the top of the log.
 *
 * Two trades on the same day are ordered by when they were entered, and then
 * by id. Without those two the comparator returned 0 for every same-date pair
 * and the log fell back on whatever order the rows arrived in — which is not
 * stable between devices, so the same two trades could appear either way
 * round. The id is not meaningful, only decisive: it is there so two clients
 * holding the same rows cannot disagree, matching how the ledger breaks ties
 * (state/ledger.ts).
 *
 * `createdAt` is optional on the type and absent on rows entered before it was
 * carried through, so a row without one sorts as the oldest of its day rather
 * than throwing the order away.
 */
export function newestFirst(a: ManualTransaction, b: ManualTransaction): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  const ac = a.createdAt ?? '';
  const bc = b.createdAt ?? '';
  if (ac !== bc) return ac > bc ? -1 : 1;
  return compareStrings(a.id, b.id);
}
