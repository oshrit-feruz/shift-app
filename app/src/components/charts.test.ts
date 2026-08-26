import { describe, expect, it } from 'vitest';
import { fit } from './charts';

describe('fit', () => {
  it('uses a supplied shared domain', () => {
    expect(fit([0, 10], 100, 100, 0, [0, 20])).toEqual([
      [0, 100],
      [100, 50],
    ]);
  });
});
