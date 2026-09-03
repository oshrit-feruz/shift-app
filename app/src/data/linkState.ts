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

/**
 * WHOSE answer this is. Stored beside the boolean because the browser outlives
 * the session: without it, signing in as a second person on the same device
 * would start them on the first person's answer, and the app would offer a
 * connected-account screen to someone who has connected nothing.
 *
 * The auth layer compares this against the current user on every session
 * change and clears the moment they differ (auth/AuthProvider.tsx).
 */
const USER_KEY = 'shift.snaptrade.linkedUser';

/** Before any answer has been seen, on a device with no storage. */
let memory: boolean | null = null;
let memoryUser: string | null = null;

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

/** Who the remembered answer belongs to, or null when there is none. */
export function linkedUserId(): string | null {
  if (memoryUser !== null) return memoryUser;
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Records the server's answer for one named user, and re-renders anything
 * reading it.
 *
 * The user id is required rather than optional: an answer with nobody attached
 * is exactly the kind that outlives the person it was about.
 */
export function setLinked(linked: boolean, userId: string) {
  if (isLinked() === linked && linkedUserId() === userId && memory !== null) return;
  // Recorded before the write, so the value still answers correctly for this
  // session when storage throws (Safari private mode, cookies blocked).
  memory = linked;
  memoryUser = userId;
  try {
    localStorage.setItem(KEY, linked ? '1' : '0');
    localStorage.setItem(USER_KEY, userId);
  } catch {
    /* no storage — the answer holds for this session but does not persist */
  }
  for (const listener of listeners) listener();
}

/**
 * Forgets the remembered answer. Called on sign-out AND whenever the signed-in
 * user changes: the next person to use this browser is not the previous one,
 * and starting them on "linked" would put a connected-account entry — and, for
 * the twenty seconds the data cache lives, the previous person's holdings — in
 * front of someone else.
 */
export function clearLinked() {
  memory = null;
  memoryUser = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nothing to clear */
  }
  for (const listener of listeners) listener();
}

/**
 * Whether the server has answered for the current user *in this session*.
 *
 * The remembered flag is a cache, and a cache cannot tell "no" apart from
 * "not asked yet". Both read false. That difference is the whole of what a
 * screen needs to avoid offering someone a connect button while their
 * connection is still being discovered — most visibly on the way back from
 * the connection portal, where they have just made one.
 *
 * Session-scoped on purpose: it is not persisted, so every load asks again
 * rather than trusting a boolean written yesterday.
 */
export function isLinkResolved(): boolean {
  return memory !== null;
}

/** Notifies on every change to the flag, so a component reading it through
 * useSyncExternalStore re-renders when the link is made or revoked. */
export function subscribeLinked(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
