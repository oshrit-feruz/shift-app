import { PERSISTED, readPersisted, type AppState } from './appState';

/**
 * Pure logic for syncing the persisted slice with the user's Supabase row
 * (user_state.state jsonb). No supabase import on purpose — everything here
 * is unit-testable without a network, and the I/O lives in useRemoteSync.
 */

/** The persisted slice as a plain bag of keys — the exact shape written to
 *  localStorage today and to the user_state.state jsonb column. */
export function pickPersisted(s: AppState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED) out[k] = s[k];
  return out;
}

/**
 * Reconcile local (possibly anonymous) progress with the server row at
 * sign-in. The rule, agreed with product:
 *
 *  - Server row EMPTY (fresh signup): local wins and is uploaded, so
 *    onboarding done before signing in isn't thrown away.
 *  - Server row NON-EMPTY: server wins wholesale. Predictable cross-device
 *    behavior — and deliberately no per-key merging: splicing together two
 *    half-answered risk questionnaires would be a de-facto edit of
 *    regulatory state (see lib/advisory.ts header).
 *
 * Incoming keys are whitelisted through PERSISTED either way, so a stale or
 * hand-edited jsonb can't inject arbitrary state.
 */
export function mergeRemote(
  local: Record<string, unknown>,
  remote: unknown,
): { next: Partial<AppState>; shouldUpload: boolean } {
  const serverBag =
    remote != null && typeof remote === 'object' && !Array.isArray(remote)
      ? (remote as Record<string, unknown>)
      : {};
  const serverHasData = Object.keys(serverBag).length > 0;
  const source = serverHasData ? serverBag : local;
  // readPersisted, not a raw copy: it whitelists through PERSISTED and drops
  // the retired demo watchlist seed, so a row written before the watchlist
  // became the user's own doesn't push those eight stocks back onto a device
  // that has already dropped them.
  return { next: readPersisted(source), shouldUpload: !serverHasData };
}

/**
 * Does the server's slice say something different from what this device
 * holds? Compared over PERSISTED only, and by value: both sides are plain
 * JSON bags, and the local one is rebuilt on every render, so identity
 * comparison would report "changed" every time and make the app adopt — and
 * re-render — on every check.
 *
 * Used by the periodic re-read, which must be silent when nothing changed:
 * a device sitting idle on the watchlist should not re-render because it
 * looked.
 */
export function remoteDiffers(local: Record<string, unknown>, remote: unknown): boolean {
  const serverBag =
    remote != null && typeof remote === 'object' && !Array.isArray(remote)
      ? (remote as Record<string, unknown>)
      : null;
  // No row, or a row we cannot read as an object, is not a change to adopt —
  // it is an absence, and treating it as one would wipe the device's list.
  if (serverBag === null || Object.keys(serverBag).length === 0) return false;
  const incoming = readPersisted(serverBag);
  for (const k of PERSISTED) {
    // A key the server has never written is not a difference: the slice grows
    // over time, and an older row simply has fewer keys than this build.
    if (!(k in incoming)) continue;
    if (JSON.stringify(incoming[k]) !== JSON.stringify(local[k])) return true;
  }
  return false;
}

/**
 * Trailing debounce with an explicit flush, for the write path: the state
 * changes on every dispatch, and mirroring each one to Supabase would be a
 * request per tap. `flush` exists for pagehide — the last edit before the
 * tab closes must not sit in the timer.
 */
export function debounced<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): { call: (...args: A) => void; flush: () => void; cancel: () => void; pending: () => boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const fire = () => {
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  return {
    call: (...args: A) => {
      pending = args;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, ms);
    },
    flush: () => {
      if (timer) clearTimeout(timer);
      fire();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
    // Whether an edit is still sitting in the timer. The re-read path asks,
    // because adopting the server's slice while this device has an unsent
    // change of its own would throw that change away.
    pending: () => pending !== null,
  };
}
