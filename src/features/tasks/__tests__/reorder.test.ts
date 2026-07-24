import { describe, expect, it } from 'vitest';
import { computeInsertPosition } from '../reorder';

describe('computeInsertPosition', () => {
  it('returns a base step for an empty column', () => {
    expect(computeInsertPosition([], 0)).toBe(1000);
  });

  it('inserts before the first item', () => {
    expect(computeInsertPosition([1000, 2000], 0)).toBe(0);
  });

  it('inserts after the last item', () => {
    expect(computeInsertPosition([1000, 2000], 2)).toBe(3000);
  });

  it('inserts at the midpoint between two neighbours', () => {
    expect(computeInsertPosition([1000, 2000], 1)).toBe(1500);
  });

  it('clamps an out-of-range index to the end', () => {
    expect(computeInsertPosition([1000], 9)).toBe(2000);
  });

  it('keeps subdividing as items pack together', () => {
    expect(computeInsertPosition([1000, 1002], 1)).toBe(1001);
  });
});
