import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { IconName } from '../components/Icon';

export interface ToastItem {
  id: number;
  message: string;
  icon: IconName;
  tone: 'accent' | 'up' | 'down';
}

type ShowToast = (message: string, opts?: { icon?: IconName; tone?: ToastItem['tone'] }) => void;

const ToastsCtx = createContext<ToastItem[]>([]);
const ShowToastCtx = createContext<ShowToast>(() => {});

/** How long a toast stays up before it dismisses itself. */
const TOAST_MS = 2400;

/**
 * Ephemeral, non-persisted confirmation toasts — "added to watchlist",
 * "alert created" and the like. Deliberately outside `state/appState.tsx`:
 * that reducer's slice is either persisted or drives navigation, and a toast
 * is neither — it's gone a couple seconds after it exists, so it gets its
 * own tiny provider instead of a reducer case and a PERSISTED exclusion.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((message, opts) => {
    const id = ++nextId.current;
    setToasts((prev) => [
      ...prev,
      { id, message, icon: opts?.icon ?? 'check', tone: opts?.tone ?? 'accent' },
    ]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  return (
    <ToastsCtx.Provider value={toasts}>
      <ShowToastCtx.Provider value={show}>{children}</ShowToastCtx.Provider>
    </ToastsCtx.Provider>
  );
}

export const useToasts = () => useContext(ToastsCtx);

/** `const toast = useToast(); toast('Added to watchlist', { icon: 'watch' });` */
export function useToast(): ShowToast {
  return useContext(ShowToastCtx);
}
