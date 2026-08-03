'use client';

import { useActionState } from 'react';
import { setWeeklyTargetAction } from '@/features/memberships/actions';
import { idleResult } from '@/lib/action-result';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';

/** Admin-only inline editor for a teammate's weekly target hours. */
export function WeeklyTargetEditor({
  orgId,
  targetUserId,
  current,
}: {
  orgId: string;
  targetUserId: string;
  current: number | null;
}) {
  const [state, action] = useActionState(setWeeklyTargetAction, idleResult);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <label className="text-sm text-muted-foreground">Wochen-Soll (Std)</label>
      <Input
        type="number"
        name="weeklyHours"
        min={0}
        max={80}
        step="0.5"
        defaultValue={current ?? ''}
        placeholder="40"
        aria-label="Wochen-Soll in Stunden"
        className="h-9 w-24"
      />
      <SubmitButton variant="outline" size="sm">
        Speichern
      </SubmitButton>
      {state.status === 'error' && state.message && (
        <span className="text-xs text-destructive">{state.message}</span>
      )}
      {state.status === 'success' && <span className="text-xs text-emerald-600">✓</span>}
    </form>
  );
}
