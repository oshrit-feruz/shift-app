import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { DEMO_FLAGS } from '../data/demoFlags';

/**
 * The React mirror of the `demoData` flag.
 *
 * The flag itself lives in localStorage (data/demoFlags.ts) because the data
 * layer reads it synchronously, outside any component. But localStorage is
 * not reactive: flipping it re-renders nothing, so the chart would keep
 * showing whatever it fetched the first time.
 *
 * So this holds the same boolean in state and is the only writer of both.
 * Screens read `useDemoMode()` and put it in their `useLoadable` deps, which
 * is what makes a flip re-fetch immediately instead of on the next navigation.
 */
const DemoModeCtx = createContext<boolean>(false);
const SetDemoModeCtx = createContext<(on: boolean) => void>(() => {});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => DEMO_FLAGS.demoData);

  const set = useCallback((next: boolean) => {
    DEMO_FLAGS.set('demoData', next);
    setOn(next);
  }, []);

  return (
    <DemoModeCtx.Provider value={on}>
      <SetDemoModeCtx.Provider value={set}>{children}</SetDemoModeCtx.Provider>
    </DemoModeCtx.Provider>
  );
}

/** Whether sample data is on. Safe in `useLoadable` deps. */
export const useDemoMode = () => useContext(DemoModeCtx);

/** Flips the switch, writing through to storage so the data layer sees it. */
export const useSetDemoMode = () => useContext(SetDemoModeCtx);
