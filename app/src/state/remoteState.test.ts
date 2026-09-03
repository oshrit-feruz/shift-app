import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initial, LEGACY_SEED_WATCHLIST, PERSISTED } from './appState';
import { adoptRemote, debounced, mergeRemote, pickPersisted, remoteDiffers } from './remoteState';

describe('pickPersisted', () => {
  it('extracts exactly the PERSISTED keys', () => {
    const bag = pickPersisted(initial);
    expect(Object.keys(bag).sort()).toEqual([...PERSISTED].sort());
  });

  it('never includes ephemeral navigation state', () => {
    const bag = pickPersisted({ ...initial, screen: 'settings', ticker: 'AMD' });
    expect(bag).not.toHaveProperty('screen');
    expect(bag).not.toHaveProperty('ticker');
    expect(bag).not.toHaveProperty('fromSteps');
  });
});

describe('mergeRemote', () => {
  const local = { ...pickPersisted(initial), advAnswers: [2, 3], firstRunSeen: true };

  it('uploads local progress when the server row is empty (fresh signup)', () => {
    const { next, shouldUpload } = mergeRemote(local, {});
    expect(shouldUpload).toBe(true);
    expect(next.advAnswers).toEqual([2, 3]);
    expect(next.firstRunSeen).toBe(true);
  });

  it('treats a null/invalid server payload as empty', () => {
    expect(mergeRemote(local, null).shouldUpload).toBe(true);
    expect(mergeRemote(local, 'garbage').shouldUpload).toBe(true);
    expect(mergeRemote(local, [1, 2]).shouldUpload).toBe(true);
  });

  it('lets the server win wholesale when it has data', () => {
    const server = { advAnswers: [1, 1, 1, 1], advStage: 5, firstRunSeen: true };
    const { next, shouldUpload } = mergeRemote(local, server);
    expect(shouldUpload).toBe(false);
    expect(next.advAnswers).toEqual([1, 1, 1, 1]);
    expect(next.advStage).toBe(5);
    // Local-only keys do NOT survive a non-empty server row — no per-key
    // splicing of regulatory state (see mergeRemote docs).
    expect(next.watchlist).toBeUndefined();
  });

  it('drops the retired demo watchlist seed coming back from the server', () => {
    // A row written before the watchlist became the user's own still carries
    // the eight seeded stocks. Letting it win would push them back onto a
    // device that has already dropped them, and "starts empty" would last
    // exactly until the next sign-in.
    const server = { advStage: 2, watchlist: [...LEGACY_SEED_WATCHLIST] };
    expect(mergeRemote(local, server).next.watchlist).toEqual([]);
  });

  it('keeps a server watchlist the user actually chose', () => {
    const server = { advStage: 2, watchlist: ['ORCL', 'NVDA'] };
    expect(mergeRemote(local, server).next.watchlist).toEqual(['ORCL', 'NVDA']);
  });

  it('whitelists incoming keys through PERSISTED', () => {
    const server = { advStage: 2, screen: 'settings', evil: 'x' };
    const { next } = mergeRemote(local, server);
    expect(next).not.toHaveProperty('screen');
    expect(next).not.toHaveProperty('evil');
    expect(next.advStage).toBe(2);
  });
});

describe('debounced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once with the latest args after the wait', () => {
    const fn = vi.fn();
    const d = debounced(fn, 1000);
    d.call('a');
    d.call('b');
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('flush fires the pending call immediately, and only once', () => {
    const fn = vi.fn();
    const d = debounced(fn, 1000);
    d.call('a');
    d.flush();
    expect(fn).toHaveBeenCalledWith('a');
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending is a no-op', () => {
    const fn = vi.fn();
    const d = debounced(fn, 1000);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const d = debounced(fn, 1000);
    d.call('a');
    d.cancel();
    vi.advanceTimersByTime(2000);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('remoteDiffers — the foreground re-read', () => {
  const local = pickPersisted({ ...initial, watchlist: ['NVDA'] });

  it('sees a stock added on another device', () => {
    expect(remoteDiffers(local, { watchlist: ['NVDA', 'ORCL'] })).toBe(true);
  });

  it('sees a stock removed on another device', () => {
    expect(remoteDiffers(local, { watchlist: [] })).toBe(true);
  });

  it('stays quiet when the server says what this device already holds', () => {
    // A new array with the same contents is not a change. Identity comparison
    // would report one on every check and re-render the app on every tab
    // switch.
    expect(remoteDiffers(local, { watchlist: ['NVDA'] })).toBe(false);
  });

  it('never treats a missing or unreadable row as an instruction to wipe', () => {
    expect(remoteDiffers(local, null)).toBe(false);
    expect(remoteDiffers(local, {})).toBe(false);
    expect(remoteDiffers(local, 'garbage')).toBe(false);
    expect(remoteDiffers(local, [1, 2])).toBe(false);
  });

  it('ignores keys an older row never wrote', () => {
    // The slice grows between builds; a row written by an older client is
    // short, not different.
    expect(remoteDiffers(local, { watchlist: ['NVDA'], advStage: 0 })).toBe(false);
  });

  it('does not report the retired seed as a change worth adopting', () => {
    // It is normalised away on read, so a server row still carrying it says
    // the same thing an empty local list does.
    const empty = pickPersisted(initial);
    expect(remoteDiffers(empty, { watchlist: [...LEGACY_SEED_WATCHLIST] })).toBe(false);
  });
});

describe('debounced.pending', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports an edit still sitting in the timer, and stops once it fires', () => {
    const d = debounced(() => {}, 100);
    expect(d.pending()).toBe(false);
    d.call();
    expect(d.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(d.pending()).toBe(false);
  });

  it('is clear after a flush and after a cancel', () => {
    const d = debounced(() => {}, 100);
    d.call();
    d.flush();
    expect(d.pending()).toBe(false);
    d.call();
    d.cancel();
    expect(d.pending()).toBe(false);
  });
});

describe('adoptRemote — what the foreground re-read applies', () => {
  it('returns null when the server has nothing new', () => {
    const current = pickPersisted({ ...initial, watchlist: ['NVDA'] });
    expect(adoptRemote(current, { watchlist: ['NVDA'] })).toBeNull();
    expect(adoptRemote(current, null)).toBeNull();
  });

  it('takes the server value for the keys the row carries', () => {
    const current = pickPersisted({ ...initial, watchlist: ['NVDA'] });
    const next = adoptRemote(current, { watchlist: ['NVDA', 'ORCL'] });
    expect(next?.watchlist).toEqual(['NVDA', 'ORCL']);
  });

  it('keeps local values for keys an incomplete row does not carry', () => {
    // The failure this guards: replaceState fills every omitted key from
    // `initial`, so adopting a bare server bag would wipe the keys a row
    // written by an older client never had. Losing someone's saved alerts
    // because their stored row predates that feature is invisible until it
    // is permanent.
    const alerts = [
      {
        id: 'a1',
        ticker: 'NVDA',
        kind: 'price' as const,
        condition: 'cross' as const,
        value: '200',
        remind: 'day' as const,
        sources: { wires: true, filings: true },
        notifyBy: { push: true, email: false },
      },
    ];
    const current = pickPersisted({ ...initial, watchlist: ['NVDA'], savedAlerts: alerts });
    const next = adoptRemote(current, { watchlist: ['ORCL'] });
    expect(next?.watchlist).toEqual(['ORCL']);
    expect(next?.savedAlerts).toEqual(alerts);
  });

  it('still normalises what it adopts', () => {
    const current = pickPersisted(initial);
    expect(adoptRemote(current, { watchlist: [...LEGACY_SEED_WATCHLIST] })).toBeNull();
    expect(adoptRemote(current, { watchlist: [' orcl ', 'ORCL'] })?.watchlist).toEqual(['ORCL']);
  });

  it('reads a row written before price alerts dropped their direction', () => {
    // A server row from an older client carries 'rise' or 'fall' in a field
    // the type now says holds 'cross'. Both mean the same rule — a level —
    // so hydration says so once, rather than leaving every later reader to
    // wonder. The two on the same level collapse, as one alert should.
    const stored = (condition: string, id: string) => ({
      id,
      ticker: 'NVDA',
      kind: 'price',
      condition,
      value: '200',
      remind: 'day',
      sources: { wires: true, filings: true },
      notifyBy: { push: true, email: false },
    });
    const next = adoptRemote(pickPersisted(initial), {
      savedAlerts: [stored('rise', 'a1'), stored('fall', 'a2')],
    });
    expect(next?.savedAlerts).toHaveLength(1);
    expect(next?.savedAlerts?.[0]).toMatchObject({ id: 'a1', condition: 'cross', value: '200' });
  });

  it('drops a row whose condition no version of the app ever wrote', () => {
    // Normalising to 'cross' must not heal a corrupted row into an armed
    // alert: only the three conditions the app has actually written are read.
    const stored = (over: Record<string, unknown>) => ({
      id: 'a1',
      ticker: 'NVDA',
      kind: 'price',
      condition: 'cross',
      value: '200',
      remind: 'day',
      sources: { wires: true, filings: true },
      notifyBy: { push: true, email: false },
      ...over,
    });
    // Dropped, so the row leaves nothing to adopt and adoptRemote says the
    // server's slice matches this device's empty list.
    expect(
      adoptRemote(pickPersisted(initial), { savedAlerts: [stored({ condition: 'invalid' })] }),
    ).toBeNull();
    expect(
      adoptRemote(pickPersisted(initial), { savedAlerts: [stored({ condition: undefined })] }),
    ).toBeNull();
    const good = adoptRemote(pickPersisted(initial), { savedAlerts: [stored({})] });
    expect(good?.savedAlerts).toHaveLength(1);
  });
});
