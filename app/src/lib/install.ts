/**
 * The home-screen gate: is this window the installed app, and does this
 * device have to be?
 *
 * Product rule (see README, "Home-screen only"): on a **mobile** browser in
 * production the app refuses to run in a tab and shows the install screen
 * instead. Everywhere else — desktop, previews, `npm run dev` — nothing
 * changes: a phone can add the app to its home screen, a laptop cannot, and
 * a gate nobody can pass is a wall.
 *
 * Every check here is a pure function over an injected `Window`/UA string
 * rather than a read of the real globals, so the decision table is unit-
 * tested (install.test.ts) instead of being trusted.
 */

/**
 * Whether the gate is armed at all.
 *
 * Default: production builds only (`import.meta.env.PROD`), which includes
 * Vercel preview deployments — they are production builds of the same code.
 * `VITE_REQUIRE_INSTALL` overrides it in both directions without a code
 * change: set it to `false` on the Preview scope to leave PR previews open in
 * a tab, or to `true` in `.env.local` to see the gate while developing.
 */
export const INSTALL_GATE_ENFORCED: boolean = ((): boolean => {
  const flag = import.meta.env.VITE_REQUIRE_INSTALL as string | undefined;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return import.meta.env.PROD === true;
})();

/**
 * True when the page is running as the installed app rather than in browser
 * chrome.
 *
 * Two mechanisms, because iOS has never implemented the standard one: every
 * other engine answers the `display-mode` media query, while iOS Safari sets
 * the non-standard `navigator.standalone`. `minimal-ui` and `fullscreen` are
 * accepted alongside `standalone` — a launcher can start an installed app in
 * either, and the user did add it to their home screen, which is all the gate
 * is asking about. `window-controls-overlay` is the desktop equivalent.
 */
export function isStandaloneDisplay(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof win.matchMedia !== 'function') return false;
  return ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
    (mode) => win.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/**
 * True for phones and tablets — the devices that actually have a home screen
 * to add to.
 *
 * Capability, not user-agent: a coarse primary pointer with no hover is the
 * touch-only combination. A touchscreen laptop still reports a fine pointer
 * and hover for its trackpad, so it is not swept up; an iPad, which reports
 * a desktop UA, is caught anyway.
 */
export function isMobileDevice(win: Window = window): boolean {
  if (typeof win.matchMedia !== 'function') return false;
  return win.matchMedia('(pointer: coarse)').matches && win.matchMedia('(hover: none)').matches;
}

/** The gate's whole decision. */
export function shouldBlockUntilInstalled(input: {
  enforced: boolean;
  mobile: boolean;
  standalone: boolean;
}): boolean {
  return input.enforced && input.mobile && !input.standalone;
}

/**
 * Which set of instructions to show, since only one platform can be offered
 * a one-tap install.
 *
 *  - `prompt`     — Chromium (Android, desktop Chrome/Edge): a captured
 *                   `beforeinstallprompt` event is waiting, so a button does it.
 *  - `ios-safari` — no install API at all; the Share sheet is the only route.
 *  - `ios-other`  — Chrome/Firefox/Edge on iOS. They render in WebKit but do
 *                   not offer WebKit's "Add to Home Screen", so the honest
 *                   instruction is "open this page in Safari".
 *  - `manual`     — anything else (Firefox Android, Samsung Internet, a
 *                   Chromium that has not fired the event yet): the browser
 *                   menu carries an install item under one name or another.
 */
export type InstallRoute = 'prompt' | 'ios-safari' | 'ios-other' | 'manual';

export function installRoute(input: {
  canPrompt: boolean;
  ua: string;
  maxTouchPoints: number;
}): InstallRoute {
  if (input.canPrompt) return 'prompt';
  if (isIOS(input.ua, input.maxTouchPoints)) return isIOSSafari(input.ua) ? 'ios-safari' : 'ios-other';
  return 'manual';
}

/** iPhone/iPod/iPad — including the iPad that claims to be a Mac, which is
 *  every iPad since iPadOS 13 and is told apart by its touch points. */
export function isIOS(ua: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/** Safari, as opposed to the other iOS browsers, which are WebKit wearing a
 *  different name: Chrome is `CriOS`, Firefox `FxiOS`, Edge `EdgiOS`, Opera
 *  `OPiOS`, and in-app webviews (Instagram, Facebook, Gmail) name themselves. */
export function isIOSSafari(ua: string): boolean {
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua)) return false;
  if (/FBAN|FBAV|Instagram|Line\/|Twitter|GSA\//.test(ua)) return false;
  return /Safari/.test(ua);
}
