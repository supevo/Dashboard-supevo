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
};

/**
 * Shows the employee their own worked hours this week vs. their weekly target,
 * with a fair pro-rated status (im Rahmen / zu wenig / über Plan). Private view –
 * only the person themselves sees it (not shown to super admins).
 */
export function WorkHoursCard({ summary }: { summary: WeeklyWorkSummary }) {
  const targetMinutes = summary.targetHours * 60;
  const pct = targetMinutes > 0 ? Math.min(100, (summary.weekMinutes / targetMinutes) * 100) : 0;
  const s = STATUS[summary.status];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">🕒 Arbeitszeit diese Woche</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.badge)}>
          {s.label}
        </span>
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {formatMinutes(summary.weekMinutes)}
        </span>
        <span className="text-sm text-muted-foreground">
          / {summary.targetHours} Std Soll
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
      </div>
    </div>
  );
}
