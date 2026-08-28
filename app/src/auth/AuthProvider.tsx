import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { loading, ok, unavailable, type Loadable } from '../data/types';

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
  /** Human-readable reason the last sign-in attempt failed, or null. */
  signInError: { en: string; he: string } | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  clearSignInError: () => void;
}

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Loadable<Session | null>>(
    supabase ? loading() : unavailable(NOT_CONFIGURED),
  );
  const [signInError, setSignInError] = useState<{ en: string; he: string } | null>(
    consumeCallbackError,
  );

  useEffect(() => {
    if (!supabase) return;
    // getSession resolves from localStorage (and consumes an OAuth code in
    // the URL if one is present); onAuthStateChange keeps us live afterwards
    // — sign-in from the redirect, sign-out, token refresh.
    supabase.auth.getSession().then(({ data }) => setSession(ok(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(ok(s));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(() => {
    const signInWith = async (provider: 'google' | 'apple') => {
      if (!supabase) return; // buttons are disabled in this state anyway
      setSignInError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        // No router: OAuth has no callback route to land on, so it returns
        // to the origin and supabase-js consumes the code from the URL.
        options: { redirectTo: window.location.origin },
      });
      // On success the browser navigates away and this line never runs.
      if (error) setSignInError(SIGN_IN_FAILED);
    };
    return {
      session,
      signInError,
      signInWithGoogle: () => signInWith('google'),
      signInWithApple: () => signInWith('apple'),
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
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
