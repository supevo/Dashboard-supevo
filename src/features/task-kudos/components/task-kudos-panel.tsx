'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { giveTaskKudosAction } from '@/features/task-kudos/actions';
import type { TaskKudosInfo } from '@/features/task-kudos/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

const POINT_OPTIONS = [5, 10, 20];

export function TaskKudosPanel({
  taskId,
  projectId,
  info,
}: {
  taskId: string;
  projectId: string;
  info: TaskKudosInfo;
}) {
  const [state, action] = useActionState(giveTaskKudosAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  if (!info.completed) {
    return (
      <p className="text-sm text-muted-foreground">{de.taskKudos.notYet}</p>
    );
  }

  // The person who finished the task sees only the aggregate, never who rated.
  if (info.isCompleter) {
    return (
      <div className="space-y-1 text-sm">
        <p className="font-medium text-primary">
          {info.totalPoints} {de.taskKudos.pointsWord}
        </p>
        <p className="text-muted-foreground">
          {de.taskKudos.fromColleagues.replace('{n}', String(info.raterCount))}
        </p>
      </div>
    );
  }

  if (info.myGiven) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        {de.taskKudos.alreadyRated}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        ⭐ {de.taskKudos.pending}
      </div>
      <p className="text-sm text-muted-foreground">
        {de.taskKudos.rateHint.replace('{name}', info.completerName ?? '')}
      </p>
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <div className="flex gap-2">
        {POINT_OPTIONS.map((p) => (
          <form key={p} action={action}>
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="points" value={p} />
            <SubmitButton size="sm" variant="outline">
              +{p}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
