'use client';

import { useActionState, useEffect, useState } from 'react';
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
import { PulseWidget } from '@/features/pulse/components/pulse-widget';
import { ClockOutChoresModal } from '@/features/office-chores/components/clock-out-chores';
import type { WorkStatus } from '@/features/time-tracking/queries';

export function WorkClock({
  orgId,
  status,
  weeklyPulseDue = false,
  pulseInitial = null,
}: {
  orgId: string;
  status: WorkStatus;
  /** True on Fridays when the weekly pulse hasn't been submitted yet – the
   *  "Wie war deine Woche?"-check then pops up once the person clocks out. */
  weeklyPulseDue?: boolean;
  pulseInitial?: { mood: number; comment: string | null } | null;
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
  const [showPulse, setShowPulse] = useState(false);
  const [showChores, setShowChores] = useState(false);

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

  // On a Friday clock-out, surface the weekly "Wie war deine Woche?"-check once.
  useEffect(() => {
    if (outState.status === 'success' && weeklyPulseDue) setShowPulse(true);
  }, [outState, weeklyPulseDue]);

  // After clocking out, show the assigned office chore (modal self-closes when
  // nothing was assigned).
  useEffect(() => {
    if (outState.status === 'success') setShowChores(true);
  }, [outState]);

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

      <ClockOutChoresModal
        open={showChores}
        onClose={() => setShowChores(false)}
      />

      {showPulse && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={de.common.close}
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPulse(false)}
          />
          <div className="relative w-full max-w-md">
            <PulseWidget
              initial={pulseInitial}
              onDone={() => setShowPulse(false)}
            />
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowPulse(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Später
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
