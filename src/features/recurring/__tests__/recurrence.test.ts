import { describe, it, expect } from 'vitest';
import { nextRunAfter, advancePastToday } from '../recurrence';

describe('nextRunAfter', () => {
  it('weekly picks the next matching weekday', () => {
    // 2024-01-01 is a Monday (weekday 1). Next Wednesday (3) is 2024-01-03.
    expect(nextRunAfter('weekly', 3, null, '2024-01-01')).toBe('2024-01-03');
  });

  it('weekly wraps to the following week when the day already passed', () => {
    // From Wed 2024-01-03, next Monday (1) is 2024-01-08.
    expect(nextRunAfter('weekly', 1, null, '2024-01-03')).toBe('2024-01-08');
  });

  it('monthly picks this month when the day is still ahead', () => {
    expect(nextRunAfter('monthly', null, 15, '2024-01-01')).toBe('2024-01-15');
  });

  it('monthly rolls to next month when the day already passed', () => {
    expect(nextRunAfter('monthly', null, 15, '2024-01-20')).toBe('2024-02-15');
  });

  it('monthly clamps day-of-month to 28', () => {
    expect(nextRunAfter('monthly', null, 31, '2024-01-01')).toBe('2024-01-28');
  });
});

describe('advancePastToday', () => {
  it('skips missed periods so it lands in the future', () => {
    // current far in the past; today 2024-03-10; monthly on the 5th → 2024-04-05
    const next = advancePastToday('monthly', null, 5, '2024-01-05', '2024-03-10');
    expect(next).toBe('2024-04-05');
  });
});
