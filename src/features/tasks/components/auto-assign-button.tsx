'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { autoAssignTaskAction } from '@/features/tasks/auto-assign';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function AutoAssignButton({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const [state, action] = useActionState(autoAssignTaskAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <SubmitButton size="sm" variant="outline">
          ✨ {de.task.autoAssign}
        </SubmitButton>
      </form>
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
    </div>
  );
}
