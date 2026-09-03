import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchNotifications,
  markAllRead,
  markRead,
  unreadCount,
  type AppNotification,
} from './notifications';
import { useLoadable } from './useLoadable';
import type { Loadable } from './types';

/**
 * How often an open app re-reads its notifications. The engine runs every
 * few minutes at most, so a minute is the finest cadence that could ever
 * show something new — and useLoadable already reads once on every return
 * to the foreground, which is when a phone actually notices a banner.
 */
export const NOTIFICATIONS_REFRESH_MS = 60_000;

/**
 * The notification centre's state, shared by the header badge and the
 * sheet so the two cannot disagree — the same reason the old
 * `unreadNotifications` function existed, now over real rows.
 *
 * Marking read is optimistic: the row flips on screen at once and the write
 * goes out behind it. The override is applied on top of whatever the next
 * silent re-read returns, so a read that raced the write cannot un-read the
 * row for a minute. A row that arrives AFTER "mark all read" stays unread:
 * the mark is an instant, and anything newer than it was not seen.
 */
export function useNotifications(userId: string | null) {
  const { state, retry } = useLoadable(() => fetchNotifications(userId), [userId], NOTIFICATIONS_REFRESH_MS);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [allReadAt, setAllReadAt] = useState<number | null>(null);

  // The overrides describe one person's reading. `userId` changes without a
  // remount when a session ends and another begins, and a carried-over
  // `allReadAt` would mark every older row of the next user read on screen
  // while the database still holds them unread.
  useEffect(() => {
    setReadIds(new Set());
    setAllReadAt(null);
  }, [userId]);

  const list: Loadable<AppNotification[]> = useMemo(() => {
    if (state.status !== 'ok') return state;
    return {
      status: 'ok',
      data: state.data.map((n) =>
        n.unread && (readIds.has(n.id) || (allReadAt !== null && Date.parse(n.createdAt) <= allReadAt))
          ? { ...n, unread: false }
          : n,
      ),
    };
  }, [state, readIds, allReadAt]);

  const unread = list.status === 'ok' ? unreadCount(list.data) : 0;

  const markOne = useCallback(
    (id: string) => {
      setReadIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
      if (userId) void markRead(userId, id);
    },
    [userId],
  );

  const markAll = useCallback(() => {
    setAllReadAt(Date.now());
    if (userId) void markAllRead(userId);
  }, [userId]);

  return { list, unread, markOne, markAll, retry, signedIn: userId !== null };
}

export type NotificationCentre = ReturnType<typeof useNotifications>;
