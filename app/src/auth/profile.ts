import type { User } from '@supabase/supabase-js';

/**
 * The identity an OAuth sign-in actually gives us — and the whole of it.
 *
 * The app requests `scope=email profile`, so Google returns an email, a
 * display name and a picture. Nothing else is available, and nothing else is
 * asked for. Every field is nullable because every field can genuinely be
 * absent: Apple (once enabled) sends a name only on the first authorisation
 * and never a picture, and a Google account can have no picture set.
 *
 * A missing field must render as absent, not as a placeholder — the same rule
 * the data layer follows for numbers (see data/types.ts). There is no
 * "guess a name from the email address" here on purpose: `o.feruz` is not
 * someone's name, and greeting them by it would be a small fabrication.
 */
export interface UserProfile {
  email: string | null;
  fullName: string | null;
  /** Given name — what a greeting should use. */
  firstName: string | null;
  avatarUrl: string | null;
  /** Provider's language/region preference, e.g. 'he' or 'en-US'. */
  locale: string | null;
}

export const EMPTY_PROFILE: UserProfile = {
  email: null,
  fullName: null,
  firstName: null,
  avatarUrl: null,
  locale: null,
};

/**
 * Reads a metadata value as a usable string, or null.
 *
 * The `?? ` operator alone is not enough here: OAuth metadata routinely
 * carries empty strings for fields the provider has no value for, and an
 * empty string is not null — it would sail through a nullish check and render
 * as a blank name.
 */
function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Extracts the profile from a Supabase user.
 *
 * Key names differ between providers and Supabase passes the raw claims
 * through, so each value is read with a fallback chain rather than one
 * hard-coded key: Google populates both `full_name` and `name`, and both
 * `avatar_url` and `picture`, but that is a convention rather than a
 * guarantee, and Apple fills fewer of them.
 */
export function readProfile(user: User | null | undefined): UserProfile {
  if (!user) return EMPTY_PROFILE;
  const meta: Record<string, unknown> = user.user_metadata ?? {};
  const fullName = str(meta.full_name) ?? str(meta.name);
  // Prefer the provider's own `given_name` over splitting the display name.
  // Splitting is a guess that a name is "first last" in that order, which is
  // wrong for plenty of real names — a compound given name loses half of
  // itself, and a family-name-first convention gets greeted by surname. The
  // split stays only as the fallback for a provider that sends no given name.
  const givenName = str(meta.given_name);
  return {
    // The top-level email is the verified one Supabase resolved; the metadata
    // copy is the provider's raw claim and only a fallback.
    email: str(user.email) ?? str(meta.email),
    fullName,
    firstName: givenName ?? (fullName ? (fullName.split(/\s+/)[0] ?? null) : null),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
    locale: str(meta.locale),
  };
}

/**
 * Maps a provider locale onto the app's two languages.
 *
 * Deliberately a prefix test rather than an exact match: Google sends region
 * tags ('en-US', 'he-IL'), and an equality check against 'he' would send
 * every Israeli account with a region tag to English. Anything that is not
 * Hebrew falls to English, which is the honest reading of "we support two
 * languages" — a French locale is not better served by Hebrew.
 */
export function localeToLanguage(locale: string | null): 'he' | 'en' {
  return locale?.toLowerCase().startsWith('he') ? 'he' : 'en';
}

/** What the user has chosen for themselves, overriding the provider. */
export interface ProfileOverrides {
  displayName: string | null;
  /** Already-resolved public URL of an uploaded avatar. */
  avatarUrl: string | null;
}

/** Longest display name the profiles table will accept. */
export const DISPLAY_NAME_MAX = 60;

/**
 * Mirrors the database's own CHECK constraint (see migration 0003).
 *
 * Validating here as well is not redundancy for its own sake: it turns a
 * round trip that fails with a Postgres constraint error into an inline
 * message the user can act on. The database check remains the real
 * enforcement — anything holding a session can write to the table directly.
 */
export function isValidDisplayName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= DISPLAY_NAME_MAX;
}

/**
 * Applies the user's own choices on top of the provider's identity.
 *
 * A chosen display name also decides the greeting, which is why `firstName`
 * is re-derived from it rather than kept from the provider: someone who
 * renamed themselves should not still be greeted by the Google given name
 * they were trying to replace. Here the split is the only option available —
 * there is no separate "given name" in a single free-text field.
 */
export function mergeProfile(identity: UserProfile, overrides: ProfileOverrides): UserProfile {
  const displayName = str(overrides.displayName);
  return {
    ...identity,
    fullName: displayName ?? identity.fullName,
    firstName: displayName ? (displayName.split(/\s+/)[0] ?? null) : identity.firstName,
    avatarUrl: str(overrides.avatarUrl) ?? identity.avatarUrl,
  };
}
