import { describe, it, expect } from 'vitest';
import { readableTextColor, isValidHexColor } from '@/lib/color';

describe('readableTextColor', () => {
  it('uses white text on dark backgrounds', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff');
  });
  it('uses black text on light backgrounds', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#ffe08a')).toBe('#000000');
  });
  it('supports shorthand hex', () => {
    expect(readableTextColor('#fff')).toBe('#000000');
    expect(readableTextColor('#000')).toBe('#ffffff');
  });
});

describe('isValidHexColor', () => {
  it('accepts valid hex colors', () => {
    expect(isValidHexColor('#3366ff')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
  });
  it('rejects invalid values', () => {
    expect(isValidHexColor('3366ff')).toBe(false);
    expect(isValidHexColor('#12')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
  });
});
