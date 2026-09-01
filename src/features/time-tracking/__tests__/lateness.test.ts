import { describe, it, expect } from 'vitest';
import {
  lateTierForMinutes,
  LATE_XP,
  ON_TIME_UNTIL_MIN,
} from '@/features/time-tracking/lateness';

const min = (h: number, m: number) => h * 60 + m;

describe('lateTierForMinutes', () => {
  it('treats anything up to and including 08:45 as on time', () => {
    expect(lateTierForMinutes(min(7, 0))).toBeNull();
    expect(lateTierForMinutes(min(8, 44))).toBeNull();
    expect(lateTierForMinutes(min(8, 45))).toBeNull();
    expect(ON_TIME_UNTIL_MIN).toBe(min(8, 45));
  });

  it('grades 08:46–08:50 as minor', () => {
    expect(lateTierForMinutes(min(8, 46))).toBe('minor');
    expect(lateTierForMinutes(min(8, 50))).toBe('minor');
  });

  it('grades 08:51–09:00 as major', () => {
    expect(lateTierForMinutes(min(8, 51))).toBe('major');
    expect(lateTierForMinutes(min(9, 0))).toBe('major');
  });

  it('grades anything after 09:00 as critical', () => {
    expect(lateTierForMinutes(min(9, 1))).toBe('critical');
    expect(lateTierForMinutes(min(11, 30))).toBe('critical');
  });
});

describe('LATE_XP', () => {
  it('is strictly negative and escalates with severity', () => {
    expect(LATE_XP.minor).toBeLessThan(0);
    expect(LATE_XP.major).toBeLessThan(LATE_XP.minor);
    expect(LATE_XP.critical).toBeLessThan(LATE_XP.major);
  });
});
