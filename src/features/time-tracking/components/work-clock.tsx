'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  clockInAction,
  clockOutAction,
  startBreakAction,
  endBreakAction,
} from '@/features/time-tracking/work-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { formatMinutes } from '@/lib/time';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import type { WorkStatus } from '@/features/time-tracking/queries';

export function WorkClock({
  orgId,
  status,
}: {
  orgId: string;
  status: WorkStatus;
}) {
  const [inState, inAction] = useActionState(clockInAction, idleResult);
  const [outState, outAction] = useActionState(
    async () => clockOutAction(),
    idleResult,
  );
  const [startBreakState, startBreakA] = useActionState(
    async () => startBreakAction(),
    idleResult,
  );
  const [endBreakState, endBreakA] = useActionState(
    async () => endBreakAction(),
    idleResult,
  );
  const router = useRouter();

  const anyError =
    [inState, outState, startBreakState, endBreakState].find(
      (s) => s.status === 'error',
    ) ?? null;

  useEffect(() => {
    if (
      [inState, outState, startBreakState, endBreakState].some(
        (s) => s.status === 'success',
      )
    ) {
      router.refresh();
    }
  }, [inState, outState, startBreakState, endBreakState, router]);

  const statusLabel = !status.openSessionId
    ? de.time.statusClockedOut
    : status.onBreak
      ? de.time.statusBreak
      : de.time.statusActive;

  return (
    <div className="space-y-3">
      {anyError?.status === 'error' && (
        <Alert variant="destructive">{anyError.message}</Alert>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm">
          Status: <span className="font-medium">{statusLabel}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {de.time.today}: {formatMinutes(status.todayMinutes)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {!status.openSessionId ? (
          <form action={inAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <SubmitButton size="sm">{de.time.clockIn}</SubmitButton>
          </form>
        ) : (
          <>
            <form action={outAction}>
              <SubmitButton size="sm" variant="destructive">
                {de.time.clockOut}
              </SubmitButton>
            </form>
            {status.onBreak ? (
              <form action={endBreakA}>
                <SubmitButton size="sm" variant="outline">
                  {de.time.endBreak}
                </SubmitButton>
              </form>
            ) : (
              <form action={startBreakA}>
                <SubmitButton size="sm" variant="outline">
                  {de.time.startBreak}
                </SubmitButton>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
