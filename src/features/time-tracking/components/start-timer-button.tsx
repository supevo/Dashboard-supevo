'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startTaskTimerAction } from '@/features/time-tracking/timer-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function StartTimerButton({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const [state, action] = useActionState(startTaskTimerAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <form action={action}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <SubmitButton size="sm" variant="outline">
          ▶ {de.time.startTimer}
        </SubmitButton>
      </form>
    </div>
  );
}
