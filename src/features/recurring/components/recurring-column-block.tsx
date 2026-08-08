'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleRecurringTaskAction,
  deleteRecurringTaskAction,
} from '@/features/recurring/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';
import type { RecurringTask } from '@/features/recurring/queries';

function cadenceLabel(t: RecurringTask): string {
  if (t.frequency === 'weekly') {
    return `${de.recurring.weeklyOn} ${de.recurring.weekdays[t.weekday ?? 1]}`;
  }
  return `${de.recurring.monthlyOn} ${t.dayOfMonth ?? 1}.`;
}

function ManageRow({
  t,
  projectId,
}: {
  t: RecurringTask;
  projectId: string;
}) {
  const [, toggle] = useActionState(toggleRecurringTaskAction, idleResult);
  const [, remove] = useActionState(deleteRecurringTaskAction, idleResult);
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 pt-1">
      <form
        action={toggle}
        onSubmit={() => setTimeout(() => router.refresh(), 300)}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="active" value={t.active ? 'false' : 'true'} />
        <button
          type="submit"
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background"
        >
          {t.active ? de.recurring.pause : de.recurring.resume}
        </button>
      </form>
      <form
        action={remove}
        onSubmit={() => setTimeout(() => router.refresh(), 300)}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={t.id} />
        <button
          type="submit"
          aria-label={de.recurring.delete}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background"
        >
          ✕
        </button>
      </form>
    </div>
  );
}

/**
 * Compact list of a project's recurring-task templates, pinned to the foot of
 * the "In Arbeit" column. Recurring tasks are, conceptually, work that is always
 * in progress – so they sit inside that column but visually set apart. Managers
 * can expand each entry to pause/resume or delete it.
 */
export function RecurringColumnBlock({
  projectId,
  items,
  canManage,
}: {
  projectId: string;
  items: RecurringTask[];
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-background/40 p-2">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          🔁 {de.recurring.title}
        </span>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-md border border-border bg-card/60 px-2 py-1.5',
              !t.active && 'opacity-60',
            )}
          >
            <div className="truncate text-xs font-medium">
              {t.title}
              {!t.active && (
                <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                  {de.recurring.paused}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {cadenceLabel(t)}
            </div>
            {canManage && expanded && (
              <ManageRow t={t} projectId={projectId} />
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 w-full rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-background"
        >
          {expanded ? de.common.close : de.recurring.manage}
        </button>
      )}
    </div>
  );
}
