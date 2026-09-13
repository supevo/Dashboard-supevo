import Link from 'next/link';
import { getTodayPlan } from '@/features/plan/queries';
import { ClaimButton, NewPlanButton } from '@/features/plan/components/plan-actions';

/**
 * „Dein Plan für heute": kuratierte Tageskarte mit bis zu drei Aufgaben
 * (eigene priorisiert + passende zum Übernehmen). Ersetzt die frühere
 * Morning-Briefing-Textkarte oben in der Übersicht.
 */
export async function TodayPlan({ userId }: { userId: string }) {
  const items = await getTodayPlan(userId);

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-lg">
            🎯
          </div>
          <div>
            <h2 className="text-lg font-bold">Dein Plan für heute</h2>
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? 'Gerade nichts Dringendes – schau später wieder rein.'
                : `${items.length} ausgewählte ${items.length === 1 ? 'Aufgabe' : 'Aufgaben'}, die dich und unsere Kunden voranbringen.`}
            </p>
          </div>
        </div>
        <NewPlanButton />
      </div>

      {items.length > 0 && (
        <ol className="mt-4 space-y-3">
          {items.map((it, i) => (
            <li
              key={it.taskId}
              className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${
                it.recommended
                  ? 'border-amber-500/60 bg-amber-500/[0.04]'
                  : 'bg-background/40'
              }`}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold text-muted-foreground">
                {i + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{it.title}</span>
                  {it.recommended && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      Empfohlen
                    </span>
                  )}
                  {it.status === 'in_progress' && (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                      ▶ In Arbeit
                    </span>
                  )}
                  {it.status === 'due' && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Muss fertig
                    </span>
                  )}
                  {it.status === 'available' && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      verfügbar
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {it.clientName && <span>👤 {it.clientName}</span>}
                  <span>🏷️ {it.category}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{it.reason}</p>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-1 text-sm">
                {it.dueLabel && (
                  <span
                    className={
                      it.dueLabel === 'Überfällig'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    ⏰ {it.dueLabel}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {it.ready ? 'Bereit' : 'Blockiert'}
                </span>
              </div>

              <div className="shrink-0">
                {it.mine ? (
                  <Link
                    href={`/app/projects/${it.projectId}/tasks/${it.taskId}`}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Loslegen →
                  </Link>
                ) : (
                  <ClaimButton taskId={it.taskId} projectId={it.projectId} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
