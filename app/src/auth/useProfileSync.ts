import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

/**
 * Mirrors the provider's identity into the user's `profiles` row on sign-in.
 *
 * The signup trigger already captures it once (supabase/migrations/
 * 0002_profile_identity.sql), so why write it again? Because a Google account
 * is not frozen: people change their display name and their picture, and the
 * trigger fires exactly once, at signup. Without this the row would drift and
 * slowly become a record of who the user was on the day they joined.
 *
 * The UI does not read this row — it reads the session (see AuthProvider) —
 * so nothing on screen waits for this write. It exists so that the features
 * built on `profiles` later, and anything server-side, see current data.
 *
 * Write-once per sign-in, and best-effort: a failure leaves the previous
 * values in place, which is stale but never wrong-by-invention.
 */
export function useProfileSync() {
  const { session, profile } = useAuth();
  const userId = session.status === 'ok' && session.data ? session.data.user.id : null;
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      syncedFor.current = null;
      return;
    }
    if (!supabase || syncedFor.current === userId) return;
    syncedFor.current = userId;
    supabase
      .from('profiles')
      .update({
        email: profile.email,
        full_name: profile.fullName,
        avatar_url: profile.avatarUrl,
        locale: profile.locale,
      })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) console.warn('profile sync failed', error.message);
      });
  }, [userId, profile]);
}
