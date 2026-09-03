/**
 * The service worker: an install prompt enabler, and the receiving end of
 * push notifications. Nothing else.
 *
 * It exists for two reasons. Chromium only offers the `beforeinstallprompt`
 * event — the one-tap "Add to home screen" button in components/InstallSteps
 * — to a page that has a manifest AND a service worker with a fetch handler.
 * Without it, Android users would fall back to the browser-menu instructions.
 * And a Web Push message can only be delivered to a service worker: the
 * `push` handler below is what turns a fired alert (api/alerts-run.ts) into
 * a banner on a phone whose app is not open.
 *
 * It caches nothing on purpose. The fetch handler is a pass-through, so every
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

/**
 * A push message is one fired alert, as api/alerts-run.ts sends it:
 * `{ title, body, ticker }`, already in the language this device subscribed
 * in (lib/push.ts records that with the subscription).
 *
 * A message with no readable JSON shows nothing rather than an empty
 * banner: the notification centre in the app still has the row, and a
 * banner with no words would be noise that says nothing.
 */
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload.title !== 'string') return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: typeof payload.body === 'string' ? payload.body : '',
      icon: '/assets/shift-icon-192.png',
      badge: '/assets/shift-icon-192.png',
      // One banner per stock at a time, replacing an older one about the
      // same ticker rather than stacking up.
      tag: typeof payload.ticker === 'string' ? `shift-${payload.ticker}` : 'shift',
      data: { ticker: payload.ticker ?? null },
    }),
  );
});

/**
 * A tap on the banner brings the app forward, or opens it. The notification
 * centre inside the app has the full row and the disclaimer where one is
 * due, so the banner itself carries no action of its own.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.focus();
      return self.clients.openWindow('/');
    }),
  );
});
