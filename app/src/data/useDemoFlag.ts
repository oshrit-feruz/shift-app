import { useSyncExternalStore } from 'react';
import { DEMO_FLAGS, type DemoFlag } from './demoFlags';

/**
 * A demo flag as reactive state.
 *
 * The flags live in localStorage rather than in appState, so React has no way
 * to know one changed. Without this, flipping a switch in Settings would only
 * show up on screens mounted afterwards — fine for a flag you set once, wrong
 * for one meant to be toggled back and forth in front of an audience.
 */
export function useDemoFlag(key: DemoFlag): boolean {
  return useSyncExternalStore(
    DEMO_FLAGS.subscribe,
    () => DEMO_FLAGS.read(key),
    // Server snapshot: this app never renders on a server, but the flags read
    // localStorage, so the default must be the "off" one either way.
    () => false,
  );
}
