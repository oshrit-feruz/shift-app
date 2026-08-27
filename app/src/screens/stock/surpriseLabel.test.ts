import { describe, it, expect } from 'vitest';
import { surpriseLabel } from './ReportsTab';
describe('surprise label', () => {
  it('never calls an exactly-in-line result a beat', () => {
    const t = (k: string) => k;
    expect(surpriseLabel(0, t as never)).toBe('stock.inline');
    expect(surpriseLabel(0.1, t as never)).toBe('stock.beat');
    expect(surpriseLabel(-0.1, t as never)).toBe('stock.miss');
  });
});
