import { supabase } from '../lib/supabase';
import { ok, unavailable, type Loadable } from './types';

/**
 * The notification centre's contents: what the alert engine
 * (api/alerts-run.ts) fired for this user, read straight from the
 * `notifications` table under Row-Level Security.
 *
 * No route in between, on purpose. The table's policies already limit a
 * session to its own rows, and the only write a client may make is to mark
 * its own rows read — so the anon client is the whole boundary here, the
 * same way it is for the watchlist. A server round-trip would add a function
 * to the deployment's count and nothing to the safety.
 *
 * Bilingual text is stored, not rendered: a notification is a record of what
 * was observed when it fired, and the component picks a language.
 */

export type NotificationKind = 'price' | 'threshold' | 'news' | 'earn';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  ticker: string;
  title: { en: string; he: string };
  detail: { en: string; he: string };
  /** When it fired, as an ISO instant. */
  createdAt: string;
  unread: boolean;
  /**
   * The Settings percent rule. Renders with the equal-prominence "alert
   * only" disclaimer and opens nothing — informational only, per the product
   * rule in README.md.
   */
  isThresholdAlert: boolean;
}

/** The newest rows shown. Older ones are not gone, only not listed. */
export const MAX_NOTIFICATIONS = 50;

/** A stored row as PostgREST hands it back. */
interface Row {
  id: string;
  kind: string;
  ticker: string;
  title_en: string;
  title_he: string;
  detail_en: string;
  detail_he: string;
  created_at: string;
  read_at: string | null;
}

/** One row to the app's shape, or null for a row that is not one. */
export function mapNotification(raw: unknown): AppNotification | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Partial<Row>;
  if (typeof r.id !== 'string' || typeof r.ticker !== 'string' || typeof r.created_at !== 'string')
    return null;
  if (r.kind !== 'price' && r.kind !== 'threshold' && r.kind !== 'news' && r.kind !== 'earn') return null;
  if (typeof r.title_en !== 'string' || typeof r.title_he !== 'string') return null;
  return {
    id: r.id,
    kind: r.kind,
    ticker: r.ticker,
    title: { en: r.title_en, he: r.title_he },
    detail: { en: r.detail_en ?? '', he: r.detail_he ?? '' },
    createdAt: r.created_at,
    unread: r.read_at === null || r.read_at === undefined,
    isThresholdAlert: r.kind === 'threshold',
  };
}

/** How many of these are unread. One function, so the badge and the sheet cannot disagree. */
export function unreadCount(list: AppNotification[]): number {
  return list.filter((n) => n.unread).length;
}

/**
 * This user's notifications, newest first.
 *
 * Signed out is `ok([])`, not unavailable: there are no notifications for
 * nobody, and that is a real answer. A missing client or a failed read is
 * unavailable — we could not find out.
 */
export async function fetchNotifications(userId: string | null): Promise<Loadable<AppNotification[]>> {
  if (userId === null) return ok([]);
  if (!supabase) return unavailable();
  const { data, error } = await supabase
    .from('notifications')
    .select('id,kind,ticker,title_en,title_he,detail_en,detail_he,created_at,read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS);
  if (error) return unavailable();
  return ok((data ?? []).map(mapNotification).filter((n): n is AppNotification => n !== null));
}

/** Mark every unread row read. Best effort; the caller re-reads afterwards. */
export async function markAllRead(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) console.warn('could not mark notifications read', error.message);
}

/** Mark one row read. */
export async function markRead(userId: string, id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) console.warn('could not mark notification read', error.message);
}

/**
 * "4m", "2h", "3d" — how long ago, in the shortest honest unit. Bilingual
 * because the Hebrew reads as a prefix ("לפני 4 ד׳") rather than a suffix.
 * Under a minute is "now": a stamp seconds old is not worth a number.
 */
export function agoLabel(createdAt: string, now: Date, lang: 'en' | 'he'): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === 'he' ? 'עכשיו' : 'now';
  if (minutes < 60) return lang === 'he' ? `לפני ${minutes} ד׳` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'he' ? `לפני ${hours} ש׳` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return lang === 'he' ? `לפני ${days} י׳` : `${days}d`;
}
