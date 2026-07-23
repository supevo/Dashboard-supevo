'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { stopTimerAction } from '@/features/time-tracking/timer-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { formatBerlinDateTime } from '@/lib/time';
import { SubmitButton } from '@/components/ui/submit-button';
import type { RunningTimer } from '@/features/time-tracking/queries';

export function TimerStop({ timer }: { timer: RunningTimer | null }) {
  const [state, action] = useActionState(
    async () => stopTimerAction(),
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  if (!timer) {
    return <p className="text-sm text-muted-foreground">{de.time.noTimer}</p>;
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium">{timer.label}</div>
        <div className="text-xs text-muted-foreground">
          seit {formatBerlinDateTime(timer.startedAt)}
        </div>
      </div>
      <form action={action}>
        <SubmitButton size="sm" variant="destructive">
          {de.time.stopTimer}
        </SubmitButton>
      </form>
    </div>
  );
}
