'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskVisibilityAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

/** Toggles a task between internal (agency-only) and client-visible. */
export function VisibilityEditor({
  projectId,
  taskId,
  isInternal,
}: {
  projectId: string;
  taskId: string;
  isInternal: boolean;
}) {
  const [state, formAction] = useActionState(
    updateTaskVisibilityAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      {/* Submit the opposite of the current state to flip it. */}
      <input
        type="hidden"
        name="isInternal"
        value={isInternal ? 'false' : 'true'}
      />

      <div className="flex items-center gap-2 text-sm">
        <span
          className={
            isInternal
              ? 'rounded bg-slate-200 px-2 py-0.5 text-slate-700'
              : 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-700'
          }
        >
          {isInternal ? de.task.internal : de.task.clientVisible}
        </span>
      </div>

      <SubmitButton size="sm" variant="outline">
        {isInternal ? de.task.makeVisible : de.task.makeInternal}
      </SubmitButton>

      <p className="text-xs text-muted-foreground">{de.task.visibilityHint}</p>
    </form>
  );
}
