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
  runningForThisTask = false,
}: {
  projectId: string;
  taskId: string;
  runningForThisTask?: boolean;
}) {
  const [state, action] = useActionState(startTaskTimerAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  if (runningForThisTask) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
        {de.time.timerRunning}
      </span>
    );
  }

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
