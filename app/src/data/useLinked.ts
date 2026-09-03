import { useSyncExternalStore } from 'react';
import { useDemoMode } from '../lib/DemoModeProvider';
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

/**
 * Whether the screens should be drawing the connected account's real figures.
 *
 * A connection alone is not enough: sample data wins while its switch is on.
 * The switch is what makes the app safe to put on a screen — a demo to an
 * investor, a walkthrough for a client, a screenshot — and a mode that could
 * still put the presenter's own positions in front of the room would not be.
 * So it hides them, and there is deliberately no "an account is connected but
 * hidden" line anywhere: saying so on a screen being shown to other people
 * gives away the very thing the switch was flipped to keep private.
 *
 * The connection is not touched, only unread. The screen that manages it
 * (screens/ConnectedAccount.tsx) still shows the truth, because that is where
 * someone goes to look at or revoke the connection rather than to present the
 * app, and hiding it there would leave no way to disconnect while the switch
 * is on.
 */
export function useLiveData(): boolean {
  const demo = useDemoMode();
  return useLinked() && !demo;
}
