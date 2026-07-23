import { describe, it, expect } from 'vitest';
import { evaluateWipMove } from '@/features/tasks/wip';

describe('evaluateWipMove – total column limit', () => {
  it('blocks when the column is at its limit', () => {
    expect(
      evaluateWipMove({
        wipLimit: 5,
        wipLimitPerUser: null,
        taskCount: 5,
        perUserCounts: [],
      }),
    ).toBe('total');
  });

  it('allows when below the limit', () => {
    expect(
      evaluateWipMove({
        wipLimit: 5,
        wipLimitPerUser: null,
        taskCount: 4,
        perUserCounts: [],
      }),
    ).toBe('ok');
  });

  it('always allows when no limit is set', () => {
    expect(
      evaluateWipMove({
        wipLimit: null,
        wipLimitPerUser: null,
        taskCount: 999,
        perUserCounts: [3, 4],
      }),
    ).toBe('ok');
  });
});

describe('evaluateWipMove – per-user limit', () => {
  it('blocks when any assignee is at the per-user limit (active column = 1)', () => {
    expect(
      evaluateWipMove({
        wipLimit: null,
        wipLimitPerUser: 1,
        taskCount: 3,
        perUserCounts: [1],
      }),
    ).toBe('user');
  });

  it('allows when the assignee is below the per-user limit', () => {
    expect(
      evaluateWipMove({
        wipLimit: null,
        wipLimitPerUser: 2,
        taskCount: 3,
        perUserCounts: [1],
      }),
    ).toBe('ok');
  });

  it('blocks if at least one of several assignees exceeds the limit', () => {
    expect(
      evaluateWipMove({
        wipLimit: null,
        wipLimitPerUser: 1,
        taskCount: 3,
        perUserCounts: [0, 1],
      }),
    ).toBe('user');
  });
});
