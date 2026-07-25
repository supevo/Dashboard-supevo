import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  getMyTasks,
  getUpcomingDeadlines,
  type AgendaTask,
  type DueBucket,
} from '@/features/agenda/queries';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PRIO_DOT: Record<string, string> = {
  low: 'bg-muted-foreground/40',
  medium: 'bg-sky-500',
  high: 'bg-amber-500',
  urgent: 'bg-red-500',
};

function TaskRow({ task, showDue }: { task: AgendaTask; showDue?: boolean }) {
  return (
    <Link
      href={`/app/tasks/${task.id}`}
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', PRIO_DOT[task.priority])}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block truncate">{task.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {task.projectName}
            {task.assignees.length > 0 && ` · ${task.assignees.join(', ')}`}
          </span>
        </span>
      </span>
      {showDue && task.dueDate && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {task.dueDate}
        </span>
      )}
    </Link>
  );
}

const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];
const BUCKET_ACCENT: Record<DueBucket, string> = {
  overdue: 'text-red-600',
  today: 'text-amber-600',
  week: 'text-foreground',
  later: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

export default async function MyTasksPage() {
  const { user } = await requireAgencyPage();
  const [mine, upcoming] = await Promise.all([
    getMyTasks(user.id),
    getUpcomingDeadlines(),
  ]);

  const totalMine = BUCKET_ORDER.reduce((n, b) => n + mine[b].length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.agenda.title}</h1>
        <p className="text-sm text-muted-foreground">{de.agenda.subtitle}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{de.agenda.myTasks}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalMine === 0 ? (
              <p className="text-sm text-muted-foreground">{de.agenda.noTasks}</p>
            ) : (
              BUCKET_ORDER.filter((b) => mine[b].length > 0).map((b) => (
                <div key={b} className="space-y-2">
                  <div
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wide',
                      BUCKET_ACCENT[b],
                    )}
                  >
                    {de.agenda.buckets[b]} ({mine[b].length})
                  </div>
                  <div className="space-y-1.5">
                    {mine[b].map((t) => (
                      <TaskRow key={t.id} task={t} showDue={b !== 'none'} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{de.agenda.upcoming}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {de.agenda.noUpcoming}
              </p>
            ) : (
              upcoming.map((day) => (
                <div key={day.date} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                      'de-DE',
                      {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      },
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {day.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
