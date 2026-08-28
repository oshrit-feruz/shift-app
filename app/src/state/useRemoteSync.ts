import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { PERSISTED, useAppState, useDispatch } from './appState';
import { debounced, mergeRemote, pickPersisted } from './remoteState';

/**
 * Keeps the persisted slice in sync with the signed-in user's Supabase row
 * (user_state.state jsonb). Mounted once via <RemoteSync/> in App.tsx.
 *
 * Flow per sign-in:
 *  1. fetch the row → mergeRemote (server wins if non-empty, else local is
 *     uploaded — see remoteState.ts) → dispatch replaceState;
 *  2. from then on, mirror every state change up with a trailing debounce,
 *     flushed on pagehide so the last edit before closing isn't lost.
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

  const writer = useMemo(
    () =>
      debounced((uid: string, bag: Record<string, unknown>) => {
        const failed = () => {
          // Best-effort, like the localStorage cache — but the dedupe
          // snapshot must not survive a failed write, or a later identical
          // state would be skipped and the promised retry never happen.
          if (lastUploaded.current === bag) lastUploaded.current = null;
        };
        supabase
          ?.from('user_state')
          .upsert({ user_id: uid, state: bag, updated_at: new Date().toISOString() })
          .then(
            ({ error }) => {
              if (error) {
                console.warn('remote sync write failed', error.message);
                failed();
              }
            },
            (err: unknown) => {
              console.warn('remote sync write failed', err);
              failed();
            },
          );
      }, 1500),
    [],
  );

  // Hydrate on sign-in; reset the app state on sign-out (covers both the
  // Settings button and an expired session) so the next account on this
  // device never inherits the previous user's slice.
  useEffect(() => {
    if (prevUserId.current && !userId) {
      writer.cancel();
      hydratedFor.current = null;
      lastUploaded.current = null;
      dispatch({ type: 'resetPersisted' });
    }
    prevUserId.current = userId;
    if (!userId || !supabase || hydratedFor.current === userId) return;

    let cancelled = false;
    const local = pickPersisted(state);
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
    // sign-in boundary, and `local` is just the snapshot taken at it.
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
