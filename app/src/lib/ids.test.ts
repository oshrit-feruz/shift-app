import { describe, expect, it, vi } from 'vitest';
import { newId } from './ids';

describe('newId', () => {
  it('prefixes and never repeats across a run', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('alert')));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id.startsWith('alert-')).toBe(true);
  });

  it('uses the platform UUID when there is one', () => {
    const randomUUID = vi.fn(() => '11111111-2222-3333-4444-555555555555');
    vi.stubGlobal('crypto', { randomUUID });
    expect(newId('tx')).toBe('tx-11111111-2222-3333-4444-555555555555');
    expect(randomUUID).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('falls back to getRandomValues, not to a weak PRNG', () => {
    const getRandomValues = vi.fn((a: Uint8Array) => {
      a.fill(0xab);
      return a;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    expect(newId('alert')).toBe('alert-abababababababab');
    vi.unstubAllGlobals();
  });

  it('still produces unique ids with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    const a = newId('alert');
    const b = newId('alert');
    expect(a).not.toBe(b);
    vi.unstubAllGlobals();
  });
});
