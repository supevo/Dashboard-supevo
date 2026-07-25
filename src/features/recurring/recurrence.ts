/**
 * Pure date maths for recurring task templates. No I/O so it is unit-testable.
 * All dates are ISO strings (YYYY-MM-DD) interpreted at UTC midnight.
 */
export type Frequency = 'weekly' | 'monthly';

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The first scheduled date strictly AFTER `afterIso`.
 * - weekly: next date whose weekday (0=Sun..6=Sat) matches `weekday`.
 * - monthly: next date whose day-of-month matches `dayOfMonth` (1..28).
 */
export function nextRunAfter(
  frequency: Frequency,
  weekday: number | null,
  dayOfMonth: number | null,
  afterIso: string,
): string {
  const after = toDate(afterIso);

  if (frequency === 'weekly') {
    const target = ((weekday ?? 1) % 7 + 7) % 7;
    const d = new Date(after);
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (d.getUTCDay() !== target);
    return toIso(d);
  }

  // monthly
  const dom = Math.min(Math.max(dayOfMonth ?? 1, 1), 28);
  const year = after.getUTCFullYear();
  const month = after.getUTCMonth();
  let candidate = new Date(Date.UTC(year, month, dom));
  if (candidate.getTime() <= after.getTime()) {
    candidate = new Date(Date.UTC(year, month + 1, dom));
  }
  return toIso(candidate);
}

/**
 * Advances a template's next-run date past `todayIso` after it has fired,
 * skipping any missed periods so no backlog piles up.
 */
export function advancePastToday(
  frequency: Frequency,
  weekday: number | null,
  dayOfMonth: number | null,
  currentIso: string,
  todayIso: string,
): string {
  let next = nextRunAfter(frequency, weekday, dayOfMonth, currentIso);
  while (next <= todayIso) {
    next = nextRunAfter(frequency, weekday, dayOfMonth, next);
  }
  return next;
}
