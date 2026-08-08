import { formatMinutes } from '@/lib/time';
import type { WeeklyWorkSummary } from '@/features/time-tracking/queries';
import { cn } from '@/lib/utils';

const STATUS: Record<
  WeeklyWorkSummary['status'],
  { label: string; badge: string; bar: string }
> = {
  on: {
    label: 'Im Rahmen',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  low: {
    label: 'Zu wenig',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  over: {
    label: 'Über Plan',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  absent: {
    label: '🌴 Abwesend',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
};

/**
 * Shows the employee their own worked hours this week vs. their weekly target,
 * with a fair pro-rated status (im Rahmen / zu wenig / über Plan). Absence days
 * (Urlaub/krank) reduce the target so time off never counts as "too little".
 * Private view – only the person themselves sees it (not super admins).
 */
export function WorkHoursCard({ summary }: { summary: WeeklyWorkSummary }) {
  const effTargetMinutes = summary.effectiveTargetHours * 60;
  const pct = effTargetMinutes > 0
    ? Math.min(100, (summary.weekMinutes / effTargetMinutes) * 100)
    : 100;
  const s = STATUS[summary.status];
  const reduced = summary.effectiveTargetHours < summary.targetHours;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">🕒 Arbeitszeit diese Woche</span>
        <div className="flex items-center gap-2">
          {summary.workStreak > 0 && (
            <span
              className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
              title="Aufeinanderfolgende Arbeitstage mit korrektem Ausstempeln. Vergisst du auszustempeln, reißt die Serie."
            >
              🔥 {summary.workStreak}-Tage-Streak
            </span>
          )}
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.badge)}>
            {s.label}
          </span>
        </div>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {formatMinutes(summary.weekMinutes)}
        </span>
        <span className="text-sm text-muted-foreground">
          / {summary.effectiveTargetHours} Std Soll
          {reduced && (
            <span className="ml-1 text-xs">(statt {summary.targetHours}, Abwesenheit)</span>
          )}
        </span>
      </div>

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width]', s.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>Heute: {formatMinutes(summary.todayMinutes)}</span>
        <span>Erwartet bis heute: {formatMinutes(summary.expectedMinutes)}</span>
        {summary.absentWorkdays > 0 && (
          <span>🌴 {summary.absentWorkdays} Abwesenheitstag(e) berücksichtigt</span>
        )}
      </div>

      {summary.onAbsenceToday ? (
        <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-700 dark:bg-violet-950/30 dark:text-violet-200">
          🌴 Du bist heute abwesend – für heute wird keine Arbeitszeit erwartet. Gute Erholung!
        </div>
      ) : summary.shortfallMinutes > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span aria-hidden>⏳</span>
          <div>
            <span className="font-semibold">
              {summary.isWeekEnd ? 'Dir fehlen diese Woche ' : 'Rückstand: '}
              {formatMinutes(summary.shortfallMinutes)}
            </span>{' '}
            {summary.isWeekEnd
              ? '– bitte noch nacharbeiten.'
              : `– du liegst hinter dem Soll. Bis zum Wochen-Soll fehlen noch ${formatMinutes(summary.remainingToTargetMinutes)}.`}
          </div>
        </div>
      ) : summary.status === 'over' ? (
        <div className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
          ✅ Alles im grünen Bereich – du liegst über dem erwarteten Soll.
        </div>
      ) : null}
    </div>
  );
}
