import { supabase } from './supabase';
import type { Language } from '../theme/ThemeProvider';

/**
 * Web Push on this device: whether it can work, whether it is on, and turning
 * it on or off.
 *
 * "On" means three things at once, and this module keeps them together so
 * the Settings toggle cannot show one without the others: the browser has
 * granted notification permission, the service worker holds a push
 * subscription, and that subscription is stored in `push_subscriptions`
 * (supabase/migrations/0006_alerts.sql) where the alert engine can find it.
 * A subscription the server does not know about is a toggle that lies.
 *
 * The public VAPID key is public by design — it identifies the server that
 * may send to this subscription, and the browser hands it to the push
 * service — which is why it may carry the VITE_ prefix. Its private half
 * never leaves api/alerts-run.ts.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport =
  /** Everything needed is here: a service worker, the Push API, a public key, a client. */
  | 'ready'
  /** The browser (or this context: a tab on iOS rather than the installed app) cannot do push. */
  | 'unsupported'
  /** The deployment has no VITE_VAPID_PUBLIC_KEY or no Supabase client — nothing to subscribe to. */
  | 'not_configured'
  /** Permission was refused in the browser; only the browser's own settings can undo that. */
  | 'denied';

/** What this device can do about push right now. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  if (!('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY || !supabase) return 'not_configured';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

/** The subscription this device holds, or null. Never prompts. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() === 'unsupported') return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Whether push is on for this device AND the server knows about it.
 *
 * Both are checked because either can go missing on its own: the browser
 * can drop a subscription, and a row can be deleted when the push service
 * reports the endpoint gone (the engine does that). Reporting "on" from the
 * browser alone would leave someone waiting for alerts that cannot arrive.
 */
export async function isPushOn(userId: string): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub || !supabase) return false;
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint)
    .maybeSingle();
  return !error && data !== null;
}

/**
 * Turn push on: ask permission, subscribe, store the subscription.
 *
 * Returns what stopped it, or null on success. A permission prompt is a
 * user gesture's to trigger, so this is called from the toggle, never on
 * load.
 */
export async function enablePush(userId: string, lang: Language): Promise<PushSupport | 'failed' | null> {
  const support = pushSupport();
  if (support !== 'ready') return support;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      }));
    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) return 'failed';
    const { error } = await (supabase as NonNullable<typeof supabase>).from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh,
        auth,
        lang,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' },
    );
    if (error) {
      console.warn('push subscription could not be stored', error.message);
      return 'failed';
    }
    return null;
  } catch (err) {
    console.warn('push subscribe failed', err);
    return 'failed';
  }
}

/**
 * Turn push off: remove the row first, then the browser's subscription. In
 * that order, so a failure half-way leaves a subscription the engine no
 * longer sends to rather than one it still does.
 */
export async function disablePush(): Promise<boolean> {
  try {
    const sub = await currentSubscription();
    if (!sub) return true;
    if (supabase) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      if (error) {
        console.warn('push subscription could not be removed', error.message);
        return false;
      }
    }
    await sub.unsubscribe();
    return true;
  } catch (err) {
    console.warn('push unsubscribe failed', err);
    return false;
  }
}

/** The VAPID public key in the form `pushManager.subscribe` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64);
  // Backed by a plain ArrayBuffer explicitly: `subscribe` wants a BufferSource
  // over an ArrayBuffer, and the bare constructor's type allows a shared one.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  // atob yields one Latin-1 character per byte, so each code point IS the byte.
  for (let i = 0; i < raw.length; i++) out[i] = raw.codePointAt(i) ?? 0;
  return out;
}
