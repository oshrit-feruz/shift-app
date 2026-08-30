import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { PERSISTED, useAppState, useDispatch } from './appState';
import { adoptRemote, debounced, mergeRemote, pickPersisted } from './remoteState';

/**
 * Keeps the persisted slice in sync with the signed-in user's Supabase row
 * (user_state.state jsonb). Mounted once via <RemoteSync/> in App.tsx.
 *
 * Flow per sign-in:
 *  1. fetch the row → mergeRemote (server wins if non-empty, else local is
 *     uploaded — see remoteState.ts) → dispatch replaceState;
 *  2. from then on, mirror every state change up with a trailing debounce,
 *     flushed on pagehide so the last edit before closing isn't lost;
 *  3. re-read the row whenever this tab comes back to the foreground, so a
 *     device left open picks up what the user did on another one. Sign-in is
 *     not the only moment the two can diverge: someone who adds a stock on
 *     their phone and switches back to a laptop tab that has been open since
 *     morning is looking at a stale list until this fires.
 *
 * All writes are best-effort try/catch, same tone as the localStorage effect
 * in appState.tsx — the on-device cache keeps working when the network
 * doesn't, and a failed write is retried by the next state change.
 */
export function useRemoteSync() {
  const { session } = useAuth();
  const state = useAppState();
  const dispatch = useDispatch();
  const userId = session.status === 'ok' && session.data ? session.data.user.id : null;

  // Which user the initial fetch+merge has completed for. Guards the write
  // path: uploading before hydration would clobber the server row with the
  // local (possibly empty) slice and defeat "server wins".
  const hydratedFor = useRef<string | null>(null);
  const prevUserId = useRef<string | null>(null);
  // The last bag handed to the writer. Set optimistically before the upsert,
  // so identical follow-up states don't re-arm the debounce — and cleared
  // again when that upsert FAILS, so "retried by the next state change" stays
  // true even when the next state happens to equal the failed one.
  const lastUploaded = useRef<Record<string, unknown> | null>(null);
  // The live state, for the re-read below. A dependency on `state` itself
  // would tear down and re-add the visibility listeners on every dispatch.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Uploads handed to Supabase and not yet settled. Distinct from the
  // debounce timer: once the timer fires the edit is in flight but no longer
  // "pending", and the server does not carry it yet either. A re-read in that
  // window sees the pre-write row, calls it a difference, and adopts it —
  // silently throwing away the edit the user just made. Counted, not a
  // boolean, because a second write can be armed while the first is settling.
  const inFlight = useRef(0);

  const writer = useMemo(
    () =>
      debounced((uid: string, bag: Record<string, unknown>) => {
        // Early return, not `supabase?.` — with no client there is no promise
        // to settle, and an increment with no matching decrement would wedge
        // the re-read off for the rest of the session.
        if (!supabase) return;
        const failed = () => {
          // Best-effort, like the localStorage cache — but the dedupe
          // snapshot must not survive a failed write, or a later identical
          // state would be skipped and the promised retry never happen.
          if (lastUploaded.current === bag) lastUploaded.current = null;
        };
        inFlight.current += 1;
        const settled = () => {
          inFlight.current -= 1;
        };
        supabase
          .from('user_state')
          .upsert({ user_id: uid, state: bag, updated_at: new Date().toISOString() })
          .then(
            ({ error }) => {
              settled();
              if (error) {
                console.warn('remote sync write failed', error.message);
                failed();
              }
            },
            (err: unknown) => {
              settled();
              console.warn('remote sync write failed', err);
              failed();
            },
          );
      }, 1500),
    [],
  );

  // Adopt the server's slice when this tab returns to the foreground.
  //
  // Every guard here exists because dropping it loses a user's edit:
  //  - an edit still in the debounce timer is flushed, and the re-read left
  //    to the next foregrounding; adopting now would discard it.
  //  - an edit already in flight means the server has not stored it yet, so
  //    what a read returns right now is the state *before* it. Adopting that
  //    would undo the edit on screen and then upload the undo.
  //  - both are re-checked when the response lands, not only when the request
  //    goes out: the user can edit while it is in the air.
  //  - the comparison and the merge are taken against the state as of the
  //    response for the same reason.
  //  - an unchanged slice is not dispatched at all. Without that check every
  //    tab switch would replaceState with equal-but-new objects, re-render
  //    the tree and re-arm an upload of what we just read.
  const resync = useCallback(() => {
    if (!userId || !supabase || hydratedFor.current !== userId) return;
    if (writer.pending()) {
      writer.flush();
      return;
    }
    if (inFlight.current > 0) return;
    supabase
      .from('user_state')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          // Best-effort like every other read here: a failed check leaves the
          // device on what it already had, which is the last thing it knew to
          // be true rather than a guess.
          if (error) return;
          if (hydratedFor.current !== userId || writer.pending() || inFlight.current > 0) return;
          const next = adoptRemote(pickPersisted(stateRef.current), data?.state ?? null);
          if (next) dispatch({ type: 'replaceState', persisted: next });
        },
        (err: unknown) => console.warn('remote sync re-read failed', err),
      );
  }, [userId, dispatch, writer]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    // A tab that never went hidden but lost the network still needs one:
    // whatever changed elsewhere while it was offline is only visible now.
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', resync);
    };
  }, [resync]);

  // Drop the previous account's slice the moment the identity changes —
  // sign-out OR a direct switch to another account.
  //
  // A LAYOUT effect, not a passive one, and split out of the fetch below for
  // that reason alone. A passive effect runs after the browser has painted,
  // so on a direct A → B switch the first frame under B's session still
  // showed A's watchlist and A's alerts. Brief, but it is one account's data
  // rendered under another's name, which is not a thing to show for any
  // number of frames. A layout effect commits the reset before that paint.
  //
  // The bookkeeping matters as much as the state: without it A's pending
  // write could still fire under B, and A's lastUploaded snapshot could
  // suppress B's first upload (a failed one would then never retry, because
  // B's bags are different objects from A's).
  useLayoutEffect(() => {
    if (prevUserId.current && prevUserId.current !== userId) {
      writer.cancel();
      hydratedFor.current = null;
      lastUploaded.current = null;
      dispatch({ type: 'resetPersisted' });
    }
    prevUserId.current = userId;
  }, [userId, dispatch, writer]);

  // Hydrate on sign-in: fetch the row, merge, and from then on mirror changes
  // up. Passive, unlike the reset above — this one waits on the network
  // anyway, so holding the paint for it would buy nothing.
  useEffect(() => {
    if (!userId || !supabase || hydratedFor.current === userId) return;

    let cancelled = false;
    // stateRef, not the closed-over `state`: on a direct A → B switch the
    // reset above has already run (layout effects precede passive ones) but
    // this closure still holds the render's pre-reset value — A's slice. With
    // an empty row for B, mergeRemote's "local wins, upload it" branch would
    // then write A's watchlist and alerts into B's row. The ref holds what
    // the reducer actually has now.
    const local = pickPersisted(stateRef.current);
    supabase
      .from('user_state')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Can't read the row — leave local state as-is and, crucially, do
          // NOT mark hydrated: writing now could overwrite server state we
          // never saw.
          console.warn('remote sync read failed', error.message);
          return;
        }
        const { next, shouldUpload } = mergeRemote(local, data?.state ?? null);
        hydratedFor.current = userId;
        dispatch({ type: 'replaceState', persisted: next });
        if (shouldUpload) writer.call(userId, local);
      });
    return () => {
      cancelled = true;
    };
    // `state` is deliberately not a dependency: this effect is about the
    // sign-in boundary, and `local` is just the snapshot taken at it — read
    // through the ref above so the snapshot is the current one.
  }, [userId, dispatch, writer]);

  // Mirror changes up while signed in and hydrated. Gated on the persisted
  // slice actually changing: most dispatches are navigation, which is not
  // persisted, and every ungated call here reset the write debounce and
  // eventually shipped an identical bag to Supabase.
  useEffect(() => {
    if (!userId || hydratedFor.current !== userId) return;
    const bag = pickPersisted(state);
    const prev = lastUploaded.current;
    if (
      prev !== null &&
      PERSISTED.every((k) => (bag as Record<string, unknown>)[k] === (prev as Record<string, unknown>)[k])
    ) {
      return;
    }
    lastUploaded.current = bag;
    writer.call(userId, bag);
  }, [state, userId, writer]);

  // The tab can vanish with a write still in the timer.
  useEffect(() => {
    const flush = () => writer.flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [writer]);
}
