/**
 * The two ids every funnel event carries, and the only two.
 *
 * WHAT THEY ARE NOT: neither is a user. There is deliberately no path from
 * either of these to a person — see supabase/migrations/0011_funnel_events.sql
 * for why the events table has no user_id column. Both are random values
 * minted on the device, and the funnel is counted by them rather than by
 * identity.
 *
 * `anonId` — one device, kept in localStorage, so a person who starts the
 * questions today and connects a broker tomorrow is one device rather than
 * two. It survives sign-out on purpose: it says nothing about who is signed
 * in, so clearing it on a session change would only fragment the counts.
 *
 * `sessionId` — one tab, kept in sessionStorage, which the browser drops when
 * the tab closes. This is the unit the funnel is actually measured in:
 * "how many sessions that started the questions reached the broker screen".
 *
 * Storage can throw outright (Safari private mode, cookies blocked) and can
 * be empty on any load, so every read is wrapped and falls back to a value
 * held in memory for the life of the page. An id that exists only in memory
 * still measures this session correctly; it simply does not tie back to the
 * device's earlier ones. Analytics is never allowed to break a screen, so
 * there is no path here that throws.
 */

import { newId } from './ids';

const ANON_KEY = 'shift.analytics.anonId';
const SESSION_KEY = 'shift.analytics.sessionId';

/** The fallbacks, minted once per page load when storage cannot be reached. */
let memoryAnon: string | null = null;
let memorySession: string | null = null;

/**
 * Reads an id from `store`, minting and writing one if it is absent or
 * malformed. Returns null when the store itself is unusable, so the caller
 * can fall back to memory — distinct from "the store worked and was empty",
 * which is handled here by writing.
 */
function readOrMint(store: () => Storage, key: string): string | null {
  try {
    const s = store();
    const existing = s.getItem(key);
    // Length-checked against the column constraint in the migration, so a
    // hand-edited or truncated value is replaced here rather than rejected by
    // the route later — where the event would simply be lost.
    if (existing && existing.length >= 8 && existing.length <= 64) return existing;
    const minted = newId('a');
    s.setItem(key, minted);
    return minted;
  } catch {
    return null;
  }
}

/** This device, across sessions. Stable once minted. */
export function anonId(): string {
  const stored = readOrMint(() => localStorage, ANON_KEY);
  if (stored !== null) return stored;
  memoryAnon ??= newId('a');
  return memoryAnon;
}

/** This tab, until it is closed. */
export function sessionId(): string {
  const stored = readOrMint(() => sessionStorage, SESSION_KEY);
  if (stored !== null) return stored;
  memorySession ??= newId('s');
  return memorySession;
}

/** Test seam: drops the in-memory fallbacks so cases can be run in isolation. */
export function resetAnalyticsIdsForTest() {
  memoryAnon = null;
  memorySession = null;
}
