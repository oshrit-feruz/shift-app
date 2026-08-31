import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  STANDALONE_MODES,
  installRoute,
  isMobileDevice,
  isStandaloneDisplay,
  type InstallRoute,
} from './install';

/**
 * The `beforeinstallprompt` event, which no TypeScript lib declares because
 * it is Chromium-only and not in any spec.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The captured event, held outside React.
 *
 * Chromium fires `beforeinstallprompt` once, early — typically before the
 * bundle has finished booting React. A listener registered inside a component
 * effect misses it and the install button never appears, so capture starts at
 * boot (see main.tsx) and the hook below reads what was caught. The event is
 * also the only handle on the native dialog: calling `prompt()` requires the
 * event object, which is why it is kept rather than just a boolean.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Starts listening. Called once from main.tsx, before React renders. */
export function startInstallPromptCapture(win: Window = window): void {
  win.addEventListener('beforeinstallprompt', (e) => {
    // Without this the browser shows its own mini-infobar; the app has its
    // own screen for asking, and two asks at once is one too many.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    // A used prompt cannot be re-fired: drop it so nothing offers a button
    // that would now do nothing.
    deferred = null;
    installedFlag = true;
    notify();
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface InstallPrompt {
  /** A native install dialog is available right now. */
  canPrompt: boolean;
  /** The browser reported a completed install in this session. */
  installed: boolean;
  /** Opens the native dialog. Resolves with what the user chose, or
   *  'unavailable' when there was no captured event to fire. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

/** The install prompt, as React state. */
export function useInstallPrompt(): InstallPrompt {
  // useSyncExternalStore rather than an effect that forces a re-render: the
  // prompt lives outside React (it has to — it arrives before React mounts),
  // and this is the API for exactly that, tearing-free and with no state to
  // keep in step with the module.
  const canPrompt = useSyncExternalStore(subscribe, () => deferred != null);
  const installed = useSyncExternalStore(subscribe, () => installedFlag);

  const promptInstall = useCallback(async () => {
    const evt = deferred;
    if (!evt) return 'unavailable' as const;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // Chromium refuses a second prompt() on the same event, so it is spent
    // either way: on 'accepted' the appinstalled listener clears it, and on
    // 'dismissed' this does, which turns the button back into instructions
    // instead of leaving a button that silently no-ops.
    deferred = null;
    notify();
    return outcome;
  }, []);

  return { canPrompt, installed, promptInstall };
}

/**
 * Whether this window is the installed app, kept live.
 *
 * The media query is watched rather than read once: a browser can move an
 * open page between display modes (Chrome's "Open in app", leaving
 * fullscreen), and the gate has to lift the moment it does rather than at the
 * next reload.
 */
export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(() => isStandaloneDisplay());
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    // Every mode isStandaloneDisplay() accepts, not just `standalone`: leaving
    // fullscreen or minimal-ui for a plain tab fires no `standalone` change,
    // so watching that one query alone would leave the hook stuck at true.
    const queries = STANDALONE_MODES.map((mode) => window.matchMedia(`(display-mode: ${mode})`));
    const onChange = () => setStandalone(isStandaloneDisplay());
    queries.forEach((mq) => mq.addEventListener('change', onChange));
    return () => queries.forEach((mq) => mq.removeEventListener('change', onChange));
  }, []);
  return standalone;
}

/** Which install route this browser gets — the native prompt, the iOS Share
 *  sequence, "open in Safari", or the browser menu. Shared by the steps
 *  component and by the gate screen, which anchors its arrow to Safari's own
 *  toolbar and so must not draw one for anybody else. */
export function useInstallRoute(): InstallRoute {
  const { canPrompt } = useInstallPrompt();
  const nav = window.navigator;
  return installRoute({ canPrompt, ua: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0 });
}

/** Phone or tablet, evaluated once — a device does not grow a mouse mid-session. */
export function useIsMobileDevice(): boolean {
  return useMemo(() => isMobileDevice(), []);
}
