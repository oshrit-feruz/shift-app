import { useSyncExternalStore } from 'react';
import { isLinkResolved, isLinked, subscribeLinked } from './linkState';

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

/**
 * The same answer, with "not asked yet" told apart from "no".
 *
 * `useLinked()` collapses the two into false, which is right for a screen that
 * only picks a data source — the fallback is the app's own data either way.
 * It is wrong for a screen that offers to CREATE a connection: someone
 * returning from the portal would be shown a connect button for the moment
 * before the first read lands, having just connected an account.
 */
export function useLinkStatus(): 'unknown' | 'linked' | 'unlinked' {
  const linked = useLinked();
  const resolved = useSyncExternalStore(subscribeLinked, isLinkResolved, () => false);
  if (!resolved) return 'unknown';
  return linked ? 'linked' : 'unlinked';
}
