'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleRecurringTaskAction,
  deleteRecurringTaskAction,
} from '@/features/recurring/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import type { RecurringTask } from '@/features/recurring/queries';

function cadenceLabel(t: RecurringTask): string {
  if (t.frequency === 'weekly') {
    return `${de.recurring.weeklyOn} ${de.recurring.weekdays[t.weekday ?? 1]}`;
  }
  return `${de.recurring.monthlyOn} ${t.dayOfMonth ?? 1}.`;
}

function Row({
  t,
  projectId,
  canManage,
}: {
  t: RecurringTask;
  projectId: string;
  canManage: boolean;
}) {
  const [, toggle] = useActionState(toggleRecurringTaskAction, idleResult);
  const [, remove] = useActionState(deleteRecurringTaskAction, idleResult);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {t.title}
          {!t.active && (
            <span className="ml-2 rounded bg-muted px-1 text-xs text-muted-foreground">
              {de.recurring.paused}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {cadenceLabel(t)} · {de.recurring.nextRun}: {t.nextRunDate} ·{' '}
          {t.isInternal ? de.task.internal : de.task.clientVisible}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-1">
          <form action={toggle} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="active" value={t.active ? 'false' : 'true'} />
            <SubmitButton variant="outline" size="sm">
              {t.active ? de.recurring.pause : de.recurring.resume}
            </SubmitButton>
          </form>
          <form action={remove} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton variant="ghost" size="sm" aria-label={de.recurring.delete}>
              ✕
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Management view for a project's recurring task templates. New templates are
 * created directly in the "new task" dialog (the "Wiederkehrend" checkbox);
 * this section lists them and lets you pause/resume or delete.
 */
export function RecurringTasksSection({
  projectId,
  items,
  canManage = true,
}: {
  projectId: string;
  items: RecurringTask[];
  /** Managers get pause/resume/delete controls; staff see a read-only list. */
  canManage?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {canManage ? de.recurring.manageHint : de.recurring.viewHint}
      </p>
      {items.length > 0 ? (
        <div className="divide-y">
          {items.map((t) => (
            <Row key={t.id} t={t} projectId={projectId} canManage={canManage} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{de.recurring.empty}</p>
      )}
    </div>
  );
}
