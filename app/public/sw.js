/**
 * A deliberately empty service worker.
 *
 * It exists for one reason: Chromium only offers the `beforeinstallprompt`
 * event — the one-tap "Add to home screen" button in components/InstallSteps
 * — to a page that has a manifest AND a service worker with a fetch handler.
 * Without it, Android users would fall back to the browser-menu instructions.
 *
 * It caches nothing on purpose. The handler is a pass-through, so every
 * request reaches the network exactly as it would with no worker at all: an
 * offline mode would mean deciding what a stale price or a stale portfolio is
 * allowed to look like, and this codebase's whole data story is that a figure
 * on screen is either current or honestly missing. Adding caching here would
 * quietly break that rule for every screen at once.
 *
 * `skipWaiting`/`clients.claim` so a change to this file takes effect on the
 * next load rather than waiting for every tab to close.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pass through to the network */
});
