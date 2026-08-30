import { describe, expect, it } from 'vitest';
import { initial, isSeededWatchlist, reducer, readPersisted, LEGACY_SEED_WATCHLIST } from './appState';

/**
 * The watchlist is the user's own list. Two things have to hold for that to
 * be true rather than decorative: it starts empty for everyone (including
 * people whose device still holds the retired demo seed), and adding or
 * removing a stock actually changes what is stored for them.
 */

describe('a watchlist nobody has filled yet', () => {
  it('starts empty', () => {
    expect(initial.watchlist).toEqual([]);
  });

  it('drops a stored slice that is still exactly the retired demo seed', () => {
    const picked = readPersisted({ watchlist: [...LEGACY_SEED_WATCHLIST] });
    expect(picked.watchlist).toEqual([]);
  });

  it('recognises the seed whatever order it was stored in', () => {
    expect(isSeededWatchlist([...LEGACY_SEED_WATCHLIST].reverse())).toBe(true);
  });

  it('leaves a list the user has actually edited alone', () => {
    // One name removed from the old seed is a decision, not a default.
    const edited = LEGACY_SEED_WATCHLIST.slice(1);
    expect(isSeededWatchlist(edited)).toBe(false);
    expect(readPersisted({ watchlist: edited }).watchlist).toEqual(edited);
    // As is a list that merely happens to be eight names long.
    const eightOthers = ['ORCL', 'GLW', 'APP', 'NFLX', 'QCOM', 'SNDK', 'WDC', 'INTC'];
    expect(isSeededWatchlist(eightOthers)).toBe(false);
    expect(readPersisted({ watchlist: eightOthers }).watchlist).toEqual(eightOthers);
  });

  it('normalises and de-duplicates whatever was stored', () => {
    const picked = readPersisted({ watchlist: [' nvda ', 'NVDA', 'amd', 7, ''] });
    expect(picked.watchlist).toEqual(['NVDA', 'AMD']);
  });

  it('says nothing about the watchlist when the stored bag has none', () => {
    expect(readPersisted({ advStage: 3 })).not.toHaveProperty('watchlist');
  });
});

describe('adding and removing really change the list', () => {
  it('adds a ticker, and appends rather than reordering', () => {
    const one = reducer(initial, { type: 'toggleWatch', ticker: 'ORCL' });
    expect(one.watchlist).toEqual(['ORCL']);
    const two = reducer(one, { type: 'toggleWatch', ticker: 'NVDA' });
    expect(two.watchlist).toEqual(['ORCL', 'NVDA']);
  });

  it('normalises the ticker on the way in, so one stock is never two rows', () => {
    const s = reducer(initial, { type: 'toggleWatch', ticker: ' orcl ' });
    expect(s.watchlist).toEqual(['ORCL']);
    // The same stock typed differently toggles the row it already made.
    expect(reducer(s, { type: 'toggleWatch', ticker: 'ORCL' }).watchlist).toEqual([]);
  });

  it('ignores an empty ticker instead of storing a blank row', () => {
    expect(reducer(initial, { type: 'toggleWatch', ticker: '  ' }).watchlist).toEqual([]);
  });

  it('removes only the ticker asked for', () => {
    const s = { ...initial, watchlist: ['ORCL', 'NVDA', 'AMD'] };
    expect(reducer(s, { type: 'removeWatch', ticker: 'NVDA' }).watchlist).toEqual(['ORCL', 'AMD']);
  });

  it('leaves state untouched when removing something not on the list', () => {
    const s = { ...initial, watchlist: ['ORCL'] };
    expect(reducer(s, { type: 'removeWatch', ticker: 'AMD' })).toBe(s);
  });
});

describe("alerts are the user's too", () => {
  const alert = {
    id: 'a1',
    ticker: 'NVDA',
    kind: 'price' as const,
    condition: 'rise' as const,
    value: '200',
    remind: 'day' as const,
    sources: { wires: true, filings: true },
    notifyBy: { push: true, email: false },
  };

  it('starts with none', () => {
    expect(initial.savedAlerts).toEqual([]);
  });

  it('adds and removes by id', () => {
    const added = reducer(initial, { type: 'addAlert', alert });
    expect(added.savedAlerts).toHaveLength(1);
    const removed = reducer(added, { type: 'removeAlert', id: 'a1' });
    expect(removed.savedAlerts).toEqual([]);
  });

  it('files the same alert once, however many times it is saved', () => {
    const once = reducer(initial, { type: 'addAlert', alert });
    const twice = reducer(once, { type: 'addAlert', alert: { ...alert, id: 'a2' } });
    expect(twice.savedAlerts).toHaveLength(1);
    // The first one keeps its id, so the row the user is looking at — and its
    // Remove button — is still the row that is there.
    expect(twice.savedAlerts[0].id).toBe('a1');
  });

  it('re-saving an alert updates how it reaches you instead of doubling it', () => {
    const once = reducer(initial, { type: 'addAlert', alert });
    const again = reducer(once, {
      type: 'addAlert',
      alert: { ...alert, id: 'a2', notifyBy: { push: false, email: true } },
    });
    expect(again.savedAlerts).toHaveLength(1);
    expect(again.savedAlerts[0].notifyBy).toEqual({ push: false, email: true });
  });

  it('keeps alerts that watch for different things', () => {
    const price = reducer(initial, { type: 'addAlert', alert });
    const lower = reducer(price, {
      type: 'addAlert',
      alert: { ...alert, id: 'a2', condition: 'fall' as const },
    });
    const other = reducer(lower, { type: 'addAlert', alert: { ...alert, id: 'a3', ticker: 'AMD' } });
    const news = reducer(other, {
      type: 'addAlert',
      alert: { ...alert, id: 'a4', kind: 'news' as const, value: 'guidance' },
    });
    expect(news.savedAlerts.map((x) => x.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('collapses duplicates a device stored before it knew better', () => {
    const picked = readPersisted({
      savedAlerts: [alert, { ...alert, id: 'a2' }, { ...alert, id: 'a3', value: '300' }, 'junk'],
    });
    expect(picked.savedAlerts?.map((x) => x.id)).toEqual(['a1', 'a3']);
  });
});
