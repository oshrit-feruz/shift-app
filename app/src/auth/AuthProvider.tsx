import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { loading, ok, unavailable, type Loadable } from '../data/types';
import { readProfile, type UserProfile } from './profile';
import { clearLinked, linkedUserId } from '../data/linkState';
import { disconnectBrokerage, fetchConnectedAccounts } from '../data/snaptradeAccount';
import { resetConnectedAccountCache } from '../data/appService';

/**
 * Auth state for the whole app, following the honest-status contract:
 *
 *   loading          — restoring the session on boot (or consuming the OAuth
 *                      redirect); the app shows a splash, never a sign-in
 *                      flash for someone who is actually signed in.
 *   unavailable      — Supabase env vars are missing on this deployment. The
 *                      sign-in screen renders with everything disabled and
 *                      says so, rather than pretending the buttons work.
 *   ok(null)         — genuinely signed out.
 *   ok(session)      — signed in.
 *
 * `signInError` is separate from the session state on purpose: a failed
 * OAuth attempt leaves the user signed out (ok(null)), and the error is a
 * message about the *attempt*, not about who they are. Bilingual like every
 * data-layer reason — this file has no access to useT (see Loadable docs).
 */
interface AuthState {
  session: Loadable<Session | null>;
  /**
   * The signed-in user's identity from the OAuth provider, or all-null when
   * signed out. Derived from the session rather than fetched: the claims
   * already travel in the token, so reading them costs no round trip and
   * cannot lag behind the session it belongs to.
   */
  profile: UserProfile;
  /** Human-readable reason the last sign-in attempt failed, or null. */
  signInError: { en: string; he: string } | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Permanently deletes the signed-in account via the server route, then
   * drops the local session. Returns an honest result the UI can render —
   * it never reports success it did not observe.
   */
  deleteAccount: () => Promise<DeleteResult>;
  clearSignInError: () => void;
}

export type DeleteResult = { ok: true } | { ok: false; reason: { en: string; he: string } };

const AuthCtx = createContext<AuthState | null>(null);

const NOT_CONFIGURED = {
  en: 'Sign-in is not configured on this deployment.',
  he: 'ההתחברות אינה מוגדרת בסביבה הזאת.',
};

/** Generic attempt-failed copy; the provider's raw error string is not shown
 *  to the user (the Loadable contract forbids uninterpreted errors). */
const SIGN_IN_FAILED = {
  en: 'The provider did not complete the sign-in. Nothing was changed — you can try again.',
  he: 'הספק לא השלים את ההתחברות. שום דבר לא השתנה — אפשר לנסות שוב.',
};

const DELETE_FAILED = {
  en: 'The account was not deleted. Nothing has changed — you can try again.',
  he: 'החשבון לא נמחק. שום דבר לא השתנה — אפשר לנסות שוב.',
};

/**
 * A failed OAuth callback lands back on `/` with error params in the query
 * string (PKCE flow). Read them once on boot, then scrub the URL so a reload
 * doesn't re-show a stale error.
 */
function consumeCallbackError(): { en: string; he: string } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('error') && !params.has('error_description')) return null;
    history.replaceState(null, '', window.location.pathname);
    return SIGN_IN_FAILED;
  } catch {
    return null;
  }
}

/**
 * Points the brokerage layer at whoever is signed in now.
 *
 * TWO THINGS GO WRONG WITHOUT THIS, and one of them is a leak.
 *
 * The leak: the remembered "is a brokerage connected" answer and the twenty
 * second cache of the answer itself both live outside React, in module state
 * and localStorage. A second person signing in on the same browser — or the
 * same person switching accounts, which never passes through signOut —
 * inherits both, so the previous user's holdings can render for the length of
 * that cache. Clearing on a CHANGED id, rather than only on sign-out, is what
 * closes it.
 *
 * The other: on a device that has never held the answer, nothing would ever
 * ask. Every screen shaped around a real account is gated on the remembered
 * flag, which starts false — so a user who connected a brokerage on their
 * phone would open the app on their laptop, be shown the connect card, and
 * have no way for the app to discover otherwise. The first read after sign-in
 * is what makes the answer real rather than remembered, and it is also what
 * greets someone returning from the connection portal.
 *
 * Fire and forget on purpose: nothing waits on it, and its own honest states
 * (data/snaptradeAccount.ts) cover a failure. It writes the flag; it does not
 * decide anything.
 */
function adoptUser(userId: string | undefined) {
  if (userId === undefined) {
    // Signed out. Forget it all rather than leave it for the next person.
    clearLinked();
    resetConnectedAccountCache();
    return;
  }
  if (linkedUserId() !== userId) {
    clearLinked();
    resetConnectedAccountCache();
  }
  void fetchConnectedAccounts();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Loadable<Session | null>>(
    supabase ? loading() : unavailable(NOT_CONFIGURED),
  );
  const [signInError, setSignInError] = useState<{ en: string; he: string } | null>(consumeCallbackError);

  useEffect(() => {
    if (!supabase) return;
    // getSession resolves from localStorage (and consumes an OAuth code in
    // the URL if one is present); onAuthStateChange keeps us live afterwards
    // — sign-in from the redirect, sign-out, token refresh.
    supabase.auth.getSession().then(({ data }) => {
      setSession(ok(data.session));
      adoptUser(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(ok(s));
      adoptUser(s?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(() => {
    const signInWith = async (provider: 'google' | 'apple') => {
      if (!supabase) return;

      setSignInError(null);

      const redirectTo = `${window.location.origin}/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (error) setSignInError(SIGN_IN_FAILED);
    };
    return {
      session,
      profile: readProfile(session.status === 'ok' ? session.data?.user : null),
      signInError,
      signInWithGoogle: () => signInWith('google'),
      signInWithApple: () => signInWith('apple'),
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        // The brokerage state is cleared by adoptUser(), which the sign-out
        // event drives — one place decides what happens when the signed-in
        // user changes, whichever way it changed.
      },
      deleteAccount: async (): Promise<DeleteResult> => {
        if (!supabase) return { ok: false, reason: NOT_CONFIGURED };
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return { ok: false, reason: DELETE_FAILED };
        // Revoke the brokerage connection BEFORE the account goes, while
        // there is still a session to authorise it with. Deleting the user
        // cascades the stored secret away, which would leave a live
        // read connection at SnapTrade that nothing left here could revoke.
        // Its failure is not fatal to the deletion — the account is the
        // user's to remove either way, and reconnecting later resets a
        // divergent link (see api/snaptrade-link.ts) — but it is attempted
        // first, every time.
        await disconnectBrokerage();
        let body: unknown = null;
        try {
          const response = await fetch('/api/delete-account', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          body = await response.json();
        } catch {
          // Network failure, or a non-JSON body. The latter is the normal
          // case under a plain `vite dev`, which has no serverless routes and
          // answers /api/* with index.html: a 200 that means nothing. Testing
          // the payload rather than response.ok is what stops that from being
          // read as a successful deletion.
          return { ok: false, reason: DELETE_FAILED };
        }
        const deleted =
          body != null && typeof body === 'object' && (body as { deleted?: unknown }).deleted === true;
        if (!deleted) return { ok: false, reason: DELETE_FAILED };
        // The account is gone; the stored session must go with it, or the app
        // keeps rendering as though the user still exists until the token
        // happens to expire.
        await supabase.auth.signOut();
        return { ok: true };
      },
      clearSignInError: () => setSignInError(null),
    };
  }, [session, signInError]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
