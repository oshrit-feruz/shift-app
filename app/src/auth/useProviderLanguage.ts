import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Opens the app in the language of the account that just signed in.
 *
 * Google reports the user's own language preference, which is a better first
 * guess than the app's Hebrew default for someone whose Google account runs
 * in English. It is only ever a guess, though: ThemeProvider ignores it once
 * the user has picked a language themselves, so this can never undo a
 * deliberate choice — it only fills in for a choice never made.
 */
export function useProviderLanguage() {
  const { profile } = useAuth();
  const { applyProviderLocale } = useTheme();
  const locale = profile.locale;

  useEffect(() => {
    if (locale == null) return;
    applyProviderLocale(locale);
    // Keyed on the locale alone: applyProviderLocale changes identity on
    // every appearance change, and depending on it would re-run this on an
    // unrelated theme toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
}
