import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initial, PERSISTED } from './appState';
import { debounced, mergeRemote, pickPersisted } from './remoteState';

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
