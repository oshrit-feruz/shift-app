import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localeToLanguage } from '../auth/profile';

export type Theme = 'dark' | 'light';
export type Signal = 'vivid' | 'balanced' | 'muted';
export type Language = 'he' | 'en';
export type ViewMode = 'beginner' | 'advanced';

interface ThemeState {
  theme: Theme;
  signal: Signal;
  language: Language;
  mode: ViewMode;
  dir: 'rtl' | 'ltr';
  setTheme: (t: Theme) => void;
  setSignal: (s: Signal) => void;
  setLanguage: (l: Language) => void;
  setMode: (m: ViewMode) => void;
  /**
   * Applies the sign-in provider's locale as the language — but only while
   * the user has never picked one themselves. A person who deliberately
   * switched to English must not be flipped back to Hebrew every time they
   * sign in, so an explicit choice permanently wins over the provider's.
   */
  applyProviderLocale: (locale: string | null) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY = 'shift.appearance';

interface StoredAppearance {
  theme?: Theme;
  signal?: Signal;
  language?: Language;
  mode?: ViewMode;
  /**
   * Whether the language came from the user rather than from a default.
   *
   * It has to be stored separately because `language` alone cannot answer
   * the question: the effect below writes the whole appearance on first
   * render, so an untouched install persists `language: 'he'` immediately
   * and is indistinguishable from a deliberate choice a moment later.
   */
  languageExplicit?: boolean;
}

function load(): StoredAppearance {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(load, []);
  const [theme, setTheme] = useState<Theme>(saved.theme ?? 'dark');
  const [signal, setSignal] = useState<Signal>(saved.signal ?? 'vivid');
  const [language, setLanguageState] = useState<Language>(saved.language ?? 'he');
  const [languageExplicit, setLanguageExplicit] = useState<boolean>(saved.languageExplicit ?? false);
  const [mode, setMode] = useState<ViewMode>(saved.mode ?? 'beginner');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    if (signal !== 'vivid') root.setAttribute('data-signal', signal);
    else root.removeAttribute('data-signal');
    root.setAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
    root.setAttribute('lang', language);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, signal, language, mode, languageExplicit }));
    } catch {
      /* storage unavailable — appearance simply won't persist */
    }
  }, [theme, signal, language, mode, languageExplicit]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      signal,
      language,
      mode,
      dir: language === 'he' ? 'rtl' : 'ltr',
      setTheme,
      setSignal,
      setLanguage: (l: Language) => {
        setLanguageState(l);
        setLanguageExplicit(true);
      },
      setMode,
      applyProviderLocale: (locale: string | null) => {
        if (languageExplicit) return;
        // Not marked explicit: this is still a default, so a later manual
        // choice can take over and a different account can bring its own.
        setLanguageState(localeToLanguage(locale));
      },
    }),
    [theme, signal, language, mode, languageExplicit],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
