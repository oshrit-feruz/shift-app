import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The one Supabase client for the whole app.
 *
 * `null` when the env vars are missing (a fresh clone, a preview deploy
 * without config). Callers must handle that honestly — the auth layer maps it
 * to an 'unavailable' Loadable so the sign-in screen says "not configured"
 * instead of pretending a button might work. We deliberately do NOT fall back
 * to an unauthenticated local-only mode: that would make the auth gate
 * silently disappear on a misconfigured deploy.
 *
 * URL + anon key are public by design (the anon key is meant to ship in the
 * client); Row-Level Security on the tables is the real boundary. Anything
 * secret (service-role key) belongs in app/api/ env only — see the note in
 * api/news.ts.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

/**
 * Apple sign-in ships wired but dark until the Apple Developer credentials
 * exist (Services ID + secret in the Supabase dashboard). Gated by an env
 * flag rather than attempt-and-fail: firing signInWithOAuth at a disabled
 * provider does a full redirect round-trip that bounces back with an error —
 * a disabled button with honest copy is the truthful state. Enabling later
 * is configuration only: set VITE_APPLE_AUTH_ENABLED=true and redeploy.
 */
export const isAppleEnabled = import.meta.env.VITE_APPLE_AUTH_ENABLED === 'true';
