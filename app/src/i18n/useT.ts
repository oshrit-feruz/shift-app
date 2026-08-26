import { useCallback } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { STRINGS, type StringKey } from './strings';

/** Translate a string key, with optional {placeholder} interpolation. */
export function useT() {
  const { language } = useTheme();
  return useCallback(
    (key: StringKey, vars?: Record<string, string | number>): string => {
      let s: string = STRINGS[key][language];
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [language],
  );
}

export type TFn = ReturnType<typeof useT>;
