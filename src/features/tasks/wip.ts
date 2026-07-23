/**
 * Pure WIP-limit evaluation. This mirrors the authoritative logic in the
 * move_task() database function so the UI can pre-check a move and tests can
 * assert the rules. The database remains the hard, race-free enforcement point.
 */

export interface WipColumnState {
  wipLimit: number | null;
  wipLimitPerUser: number | null;
  /** Number of tasks currently in the column (excluding the moving task). */
  taskCount: number;
  /** For each assignee of the moving task: how many tasks in the target
   *  column are already assigned to that user (excluding the moving task). */
  perUserCounts: number[];
}

export type WipResult = 'ok' | 'total' | 'user';

export function evaluateWipMove(state: WipColumnState): WipResult {
  if (state.wipLimit != null && state.taskCount >= state.wipLimit) {
    return 'total';
  }
  if (state.wipLimitPerUser != null) {
    const exceeded = state.perUserCounts.some(
      (count) => count >= state.wipLimitPerUser!,
    );
    if (exceeded) return 'user';
  }
  return 'ok';
}
