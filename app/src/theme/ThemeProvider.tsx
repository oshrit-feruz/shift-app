import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
}

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY = 'shift.appearance';

function load(): Partial<Pick<ThemeState, 'theme' | 'signal' | 'language' | 'mode'>> {
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
  const [language, setLanguage] = useState<Language>(saved.language ?? 'he');
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, signal, language, mode }));
    } catch {
      /* storage unavailable — appearance simply won't persist */
    }
  }, [theme, signal, language, mode]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      signal,
      language,
      mode,
      dir: language === 'he' ? 'rtl' : 'ltr',
      setTheme,
      setSignal,
      setLanguage,
      setMode,
    }),
    [theme, signal, language, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
