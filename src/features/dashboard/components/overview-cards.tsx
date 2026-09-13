import Link from 'next/link';
import { notificationHref } from '@/features/notifications/deep-link';
import type {
  OverviewToday,
  OverviewWeek,
  OpenQuestion,
  CurrentTaskRef,
} from '@/features/dashboard/overview';

function hours(min: number): number {
  return Math.round(min / 60);
}

function focusLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 60) return `vor ${Math.max(1, min)} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function CardShell({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function HeuteCard({ today }: { today: OverviewToday }) {
  const dateStr = new Date().toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const rows = [
    { dot: 'bg-red-500', label: `${today.dueTasks} Fällige Aufgaben` },
    { dot: 'bg-violet-500', label: `${today.plannedTasks} Geplante Aufgaben` },
    { dot: 'bg-muted-foreground/50', label: `${today.meetings} Meetings` },
  ];
  return (
    <CardShell
      title="Heute"
      icon="📅"
      right={<span className="text-xs text-muted-foreground">{dateStr}</span>}
    >
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
            {r.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted-foreground">
          <span className="grid h-2.5 w-2.5 place-items-center rounded-full border border-current" />
          {focusLabel(today.focusGoalMinutes)} Fokuszeit (Ziel)
        </li>
      </ul>
    </CardShell>
  );
}

export function OpenQuestionsCard({ questions }: { questions: OpenQuestion[] }) {
  return (
    <CardShell
      title="Offene Rückfragen"
      icon="💬"
      right={
        questions.length > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
            {questions.length}
          </span>
        ) : undefined
      }
    >
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Rückfragen 🎉</p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => {
            const href = notificationHref('app', q.entityType, q.entityId);
            const inner = (
              <>
                <div className="truncate text-sm font-medium">{q.text}</div>
                <div className="text-xs text-muted-foreground">{relTime(q.createdAt)}</div>
              </>
            );
            return (
              <li key={q.id} className="min-w-0">
                {href ? (
                  <Link href={href} className="block rounded-md p-1.5 hover:bg-muted">
                    {inner}
                  </Link>
                ) : (
                  <div className="p-1.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

export function WeekProgressCard({ week }: { week: OverviewWeek }) {
  const kw = isoWeek(new Date());
  const lines = [
    { color: 'text-violet-500', label: 'Aufgaben', value: `${week.tasksDone} / ${week.tasksTotal}` },
    { color: 'text-amber-500', label: 'Fokus-Stunden', value: `${hours(week.focusWorkedMinutes)} / ${hours(week.focusTargetMinutes)}` },
    { color: 'text-sky-500', label: 'Kundentermine', value: `${week.meetingsDone} / ${week.meetingsTotal}` },
  ];
  const cheer =
    week.pct >= 80
      ? 'Starke Woche! Weiter so 🚀'
      : week.pct >= 40
        ? 'Guter Lauf – dranbleiben 💪'
        : 'Noch viel drin diese Woche.';
  return (
    <CardShell
      title="Wochenfortschritt"
      icon="📊"
      right={<span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">KW {kw}</span>}
    >
      <div className="flex items-center gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#8b5cf6 ${week.pct}%, rgba(120,130,125,.22) 0)` }}
        >
          <div
            className="grid place-items-center rounded-full bg-card text-lg font-bold"
            style={{ height: '3.75rem', width: '3.75rem' }}
          >
            {week.pct}%
          </div>
        </div>
        <ul className="flex-1 space-y-1.5 text-sm">
          {lines.map((l) => (
            <li key={l.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full bg-current ${l.color}`} />
                {l.label}
              </span>
              <span className="font-medium tabular-nums">{l.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{cheer}</p>
    </CardShell>
  );
}

export function CurrentTasksCard({ tasks }: { tasks: CurrentTaskRef[] }) {
  return (
    <CardShell
      title="Aktuelle Aufgaben"
      icon="📋"
      right={
        <Link href="/app" className="text-xs text-primary hover:underline">
          Alle anzeigen
        </Link>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.taskId}>
              <Link
                href={`/app/projects/${t.projectId}/tasks/${t.taskId}`}
                className="flex items-center justify-between gap-2 rounded-md p-1.5 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{t.title}</span>
                  {t.clientName && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.clientName}
                    </span>
                  )}
                </span>
                {t.dueLabel && (
                  <span className="shrink-0 whitespace-nowrap text-xs text-amber-600 dark:text-amber-400">
                    ⏰ {t.dueLabel}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
