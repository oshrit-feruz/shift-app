import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { OnboardingAnswers, RiskProfile } from '../domain/riskProfile';

/** Locally-persisted onboarding outcome. Confirmation is a client-side
 *  understanding step only — nothing is transmitted and no account action
 *  of any kind is triggered. */
export interface ProfileState {
  answers: OnboardingAnswers;
  profile: RiskProfile;
  /** The amount the user said they intend to invest, in ILS. Used purely to
   *  illustrate the model portfolio — it is not a real account balance. */
  intendedAmount: number;
  confirmedAt: string;
}

const STORAGE_KEY = 'shift.profile.v1';

function load(): ProfileState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileState;
    if (!parsed.profile || !parsed.confirmedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ProfileContextValue {
  state: ProfileState | null;
  confirm: (state: Omit<ProfileState, 'confirmedAt'>) => void;
  reset: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState | null>(load);

  const confirm = useCallback((s: Omit<ProfileState, 'confirmedAt'>) => {
    const full: ProfileState = { ...s, confirmedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {
      // Persistence is a convenience; the in-memory state still works.
    }
    setState(full);
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState(null);
  }, []);

  const value = useMemo(() => ({ state, confirm, reset }), [state, confirm, reset]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
