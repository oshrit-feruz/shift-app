import { useSyncExternalStore } from 'react';
import { isLinked, subscribeLinked } from './linkState';

/**
 * Whether the signed-in user has a connected brokerage, as reactive state.
 *
 * The answer lives outside React (data/linkState.ts) because the data layer
 * reads it synchronously; this is how a screen follows it. Connecting or
 * disconnecting therefore re-renders every screen that changes shape around a
 * real account, without any of them subscribing to each other.
 */
export function useLinked(): boolean {
  return useSyncExternalStore(
    subscribeLinked,
    isLinked,
    // Server snapshot: this app never renders on a server, and the store reads
    // localStorage, so the default must be the "not linked" one either way.
    () => false,
  );
}
