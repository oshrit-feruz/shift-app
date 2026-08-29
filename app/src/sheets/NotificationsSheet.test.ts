import { describe, expect, it } from 'vitest';
import { unreadNotifications } from './NotificationsSheet';

/**
 * The badge in App.tsx used to be the literal 2 while this list happened to
 * hold two unread rows — a coincidence, not a derivation. Gating the list
 * would have left the header claiming 2 over an empty sheet, so both now read
 * this one function. The table is what keeps them agreeing.
 */
describe('unreadNotifications', () => {
  it('counts the demo notifications only while sample data is on and unread', () => {
    expect(unreadNotifications(false, true)).toBeGreaterThan(0);
  });

  it('is zero once they are marked read', () => {
    expect(unreadNotifications(true, true)).toBe(0);
  });

  it('is zero with sample data off, read or not — there is nothing to count', () => {
    expect(unreadNotifications(false, false)).toBe(0);
    expect(unreadNotifications(true, false)).toBe(0);
  });
});
