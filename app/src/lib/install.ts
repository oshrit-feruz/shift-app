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
export const STANDALONE_MODES = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'];

export function isStandaloneDisplay(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof win.matchMedia !== 'function') return false;
  return STANDALONE_MODES.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches);
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
 *  - `prompt`      — Chromium (Android, desktop Chrome/Edge): a captured
 *                    `beforeinstallprompt` event is waiting, so a button does it.
 *  - `ios-safari`  — no install API at all; the Share sheet is the only route.
 *  - `ios-browser` — Chrome, Firefox or Edge on **iOS 16.4 or later**, where
 *                    Apple gave third-party browsers "Add to Home Screen" in
 *                    their own share menu: the same three steps as Safari.
 *  - `ios-safari-only`
 *                  — everything else on iOS that cannot add to the home
 *                    screen itself: an in-app browser (Instagram, Facebook,
 *                    Gmail) at any version, and a third-party browser on an
 *                    iOS older than 16.4. Safari is the only way through, so
 *                    that is what it says.
 *  - `manual`      — anything else (Firefox Android, Samsung Internet, a
 *                    Chromium that has not fired the event yet): the browser
 *                    menu carries an install item under one name or another.
 */
export type InstallRoute = 'prompt' | 'ios-safari' | 'ios-browser' | 'ios-safari-only' | 'manual';

export function installRoute(input: {
  canPrompt: boolean;
  ua: string;
  maxTouchPoints: number;
}): InstallRoute {
  if (input.canPrompt) return 'prompt';
  if (!isIOS(input.ua, input.maxTouchPoints)) return 'manual';
  if (isIOSSafari(input.ua)) return 'ios-safari';
  // Safari has always been able to do this; nothing else on iOS could until
  // 16.4, and an in-app browser still cannot at any version.
  if (isIOSWebView(input.ua)) return 'ios-safari-only';
  return supportsThirdPartyInstall(input.ua) ? 'ios-browser' : 'ios-safari-only';
}

/**
 * Whether a non-Safari iOS browser can add to the home screen itself —
 * iOS/iPadOS **16.4** is where Apple opened that up (Safari 16.4 release
 * notes). Below it, Chrome, Firefox and Edge carry no such item at all, and
 * showing them Safari's three steps would be sending them to look for a
 * button that is not there.
 *
 * A UA with no version token is treated as new enough: that is the
 * iPad-claiming-to-be-a-Mac form, which only exists from iPadOS 13 and today
 * means a device many major versions past 16.4. Guessing "old" there would
 * push every modern iPad down the Safari-only route instead.
 */
export function supportsThirdPartyInstall(ua: string): boolean {
  const v = iosVersion(ua);
  if (!v) return true;
  const [major, minor] = v;
  return major > 16 || (major === 16 && minor >= 4);
}

/** The iOS version as [major, minor], or null when the UA does not carry one.
 *  The `CPU … OS 17_5` token is iOS-only — a Mac's `Mac OS X 10_15_7` does not
 *  match it, which is what keeps a desktop UA from reading as iOS 10. */
export function iosVersion(ua: string): [number, number] | null {
  const m = /CPU (?:iPhone )?OS (\d+)[._](\d+)/.exec(ua);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** iPhone/iPod/iPad — including the iPad that claims to be a Mac, which is
 *  every iPad since iPadOS 13 and is told apart by its touch points. */
export function isIOS(ua: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/**
 * A page opened inside another app rather than in a browser — Instagram,
 * Facebook, Gmail, WeChat and friends, each of which names itself in the UA.
 *
 * This is the only iOS case with no route to the home screen at all. A named
 * third-party *browser* is a different thing: since iOS 16.4 Chrome, Firefox
 * and Edge all carry "Add to Home Screen" in their share menu, so telling
 * their users to go and find Safari would be sending them somewhere they do
 * not need to go.
 */
export function isIOSWebView(ua: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|GSA\/|MicroMessenger|Snapchat/.test(ua);
}

/** Safari itself, as opposed to the other iOS browsers, which are WebKit
 *  wearing a different name: Chrome is `CriOS`, Firefox `FxiOS`, Edge
 *  `EdgiOS`, Opera `OPiOS`. */
export function isIOSSafari(ua: string): boolean {
  if (isIOSWebView(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua)) return false;
  return /Safari/.test(ua);
}
