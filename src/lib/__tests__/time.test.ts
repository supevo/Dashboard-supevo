import { describe, it, expect } from 'vitest';
import {
  minutesBetween,
  rangesOverlap,
  formatMinutes,
} from '@/lib/time';

describe('minutesBetween', () => {
  it('computes whole minutes', () => {
    expect(
      minutesBetween('2026-07-23T10:00:00Z', '2026-07-23T11:30:00Z'),
    ).toBe(90);
  });
  it('never returns negative', () => {
    expect(
      minutesBetween('2026-07-23T11:00:00Z', '2026-07-23T10:00:00Z'),
    ).toBe(0);
  });
});

describe('rangesOverlap', () => {
  it('detects overlapping ranges', () => {
    expect(
      rangesOverlap(
        '2026-07-23T10:00:00Z',
        '2026-07-23T11:00:00Z',
        '2026-07-23T10:30:00Z',
        '2026-07-23T11:30:00Z',
      ),
    ).toBe(true);
  });
  it('treats adjacent ranges as non-overlapping', () => {
    expect(
      rangesOverlap(
        '2026-07-23T10:00:00Z',
        '2026-07-23T11:00:00Z',
        '2026-07-23T11:00:00Z',
        '2026-07-23T12:00:00Z',
      ),
    ).toBe(false);
  });
  it('treats an open-ended running timer as extending to infinity', () => {
    expect(
      rangesOverlap(
        '2026-07-23T10:00:00Z',
        null,
        '2026-07-23T15:00:00Z',
        '2026-07-23T16:00:00Z',
      ),
    ).toBe(true);
  });
});

describe('formatMinutes', () => {
  it('formats hours and minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(0)).toBe('0m');
  });
});
