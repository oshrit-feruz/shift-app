import { describe, expect, it } from 'vitest';
import { agoLabel, mapNotification, unreadCount } from './notifications';

/**
 * The notification centre used to be four literal rows and a badge that
 * counted them. Now the rows come from the table the engine writes, and
 * these are the two things the client still decides for itself: which rows
 * are usable, and how many are unread.
 */

const row = {
  id: 'n1',
  kind: 'price',
  ticker: 'NVDA',
  title_en: 'NVDA rose above $200.00 (now $201.50)',
  title_he: 'NVDA עלתה מעל $200.00 (כרגע $201.50)',
  detail_en: 'Price alert',
  detail_he: 'התראת מחיר',
  created_at: '2026-09-03T14:00:00.000Z',
  read_at: null,
};

describe('mapNotification', () => {
  it('maps a stored row, unread while read_at is null', () => {
    expect(mapNotification(row)).toEqual({
      id: 'n1',
      kind: 'price',
      ticker: 'NVDA',
      title: { en: row.title_en, he: row.title_he },
      detail: { en: 'Price alert', he: 'התראת מחיר' },
      createdAt: row.created_at,
      unread: true,
      isThresholdAlert: false,
    });
    expect(mapNotification({ ...row, read_at: '2026-09-03T15:00:00Z' })?.unread).toBe(false);
  });

  it('flags the Settings threshold rule, which renders with the disclaimer', () => {
    expect(mapNotification({ ...row, kind: 'threshold' })?.isThresholdAlert).toBe(true);
  });

  it('drops a row it cannot read rather than rendering a hole', () => {
    expect(mapNotification(null)).toBeNull();
    expect(mapNotification({ ...row, kind: 'sms' })).toBeNull();
    expect(mapNotification({ ...row, id: 7 })).toBeNull();
    expect(mapNotification({ ...row, title_he: undefined })).toBeNull();
  });
});

describe('unreadCount', () => {
  it('counts the unread rows and nothing else', () => {
    const a = mapNotification(row)!;
    const b = mapNotification({ ...row, id: 'n2', read_at: '2026-09-03T15:00:00Z' })!;
    expect(unreadCount([])).toBe(0);
    expect(unreadCount([a, b])).toBe(1);
  });
});

describe('agoLabel', () => {
  const now = new Date('2026-09-03T16:00:00Z');
  it('picks the shortest honest unit, in either language', () => {
    expect(agoLabel('2026-09-03T15:59:40Z', now, 'en')).toBe('now');
    expect(agoLabel('2026-09-03T15:56:00Z', now, 'en')).toBe('4m');
    expect(agoLabel('2026-09-03T15:56:00Z', now, 'he')).toBe('לפני 4 ד׳');
    expect(agoLabel('2026-09-03T13:30:00Z', now, 'en')).toBe('2h');
    expect(agoLabel('2026-08-31T13:30:00Z', now, 'he')).toBe('לפני 3 י׳');
  });

  it('is empty for a stamp it cannot read', () => {
    expect(agoLabel('soon', now, 'en')).toBe('');
  });
});
