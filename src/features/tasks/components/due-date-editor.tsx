'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskDueDateAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

/** Sets or clears a task's due date. Saves on submit. */
export function DueDateEditor({
  projectId,
  taskId,
  dueDate,
}: {
  projectId: string;
  taskId: string;
  dueDate: string | null;
}) {
  const [state, formAction] = useActionState(
    updateTaskDueDateAction,
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
      <div className="flex items-center gap-2">
        <Input
          name="dueDate"
          type="date"
          defaultValue={dueDate ?? ''}
          className="h-9 w-auto"
          aria-label={de.task.dueDate}
        />
        <SubmitButton size="sm" variant="outline">
          {de.common.save}
        </SubmitButton>
      </div>
    </form>
  );
}
