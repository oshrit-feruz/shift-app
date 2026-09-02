/**
 * "Has this user connected a brokerage?" — remembered across loads, so the
 * app does not have to guess on the first render of every screen.
 *
 * WHY THIS EXISTS. Whether a real account is in play decides what several
 * screens render at all: the Home hero, the Portfolio tab's source, whether
 * the connected-account screen is listed. The answer lives on the server, one
 * fetch away, and the data layer (data/appService.ts) reads it synchronously,
 * outside React. Without a remembered answer every one of those screens would
 * start in the wrong state and flip once the fetch landed.
 *
 * WHAT IT IS NOT: a source of truth. It is a cache of a server fact, written
 * only by a real answer from /api/snaptrade (fetchConnectedAccounts sets it on
 * every read). Nothing here decides whether an account exists; if this says
 * "linked" and the server says otherwise, the next read corrects it and the
 * screens follow. That is why it can never cause an invented number to appear:
 * the figures themselves always come from the response, never from here.
 *
 * The storage and subscribe shape deliberately mirrors data/demoFlags.ts —
 * localStorage plus a listener set — because the screens read it the same way,
 * through a useSyncExternalStore hook.
 */

const KEY = 'shift.snaptrade.linked';

/** Before any answer has been seen, on a device with no storage. */
let memory: boolean | null = null;

const listeners = new Set<() => void>();

/**
 * What the app assumes until the first answer arrives: not linked.
 *
 * The safe direction. Assuming "linked" would have the Portfolio tab wait on
 * an account most people do not have, and would show a connected-account entry
 * to someone who never connected one. Assuming "not linked" costs a single
 * re-render for the people who did.
 */
export function isLinked(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Records the server's answer, and re-renders anything reading it. */
export function setLinked(linked: boolean) {
  if (isLinked() === linked && memory !== null) return;
  // Recorded before the write, so the value still answers correctly for this
  // session when storage throws (Safari private mode, cookies blocked).
  memory = linked;
  try {
    localStorage.setItem(KEY, linked ? '1' : '0');
  } catch {
    /* no storage — the answer holds for this session but does not persist */
  }
  for (const listener of listeners) listener();
}

/**
 * Forgets the remembered answer. Called on sign-out: the next person to use
 * this browser is not the previous one, and starting them on "linked" would
 * put a connected-account entry in front of someone who has no account.
 */
export function clearLinked() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  for (const listener of listeners) listener();
}

export function subscribeLinked(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
