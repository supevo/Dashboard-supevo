/**
 * Pure helper for drag-and-drop reordering. Task positions are stored as a
 * sparse numeric scale, so a task can be inserted between two neighbours by
 * choosing a value between their positions — no bulk renumbering required.
 */

const STEP = 1000;

/**
 * Computes the numeric position for inserting an item at `index` into a list
 * whose existing items have `sortedPositions` (ascending, excluding the moving
 * item).
 */
export function computeInsertPosition(
  sortedPositions: number[],
  index: number,
): number {
  const n = sortedPositions.length;
  const first = sortedPositions[0];
  const last = sortedPositions[n - 1];
  if (n === 0 || first === undefined || last === undefined) return STEP;

  const clamped = Math.max(0, Math.min(index, n));
  if (clamped === 0) return first - STEP;
  if (clamped === n) return last + STEP;

  const before = sortedPositions[clamped - 1];
  const after = sortedPositions[clamped];
  if (before === undefined || after === undefined) return last + STEP;
  return (before + after) / 2;
}
