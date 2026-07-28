'use client';

import { useActionState } from 'react';
import { setJoinDateAction } from '@/features/memberships/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';

/** Admin-only inline editor for a teammate's company start date. */
export function JoinDateEditor({
  orgId,
  targetUserId,
  current,
}: {
  orgId: string;
  targetUserId: string;
  current: string | null;
}) {
  const [state, action] = useActionState(setJoinDateAction, idleResult);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <label className="text-sm text-muted-foreground">{de.team.joinDate}</label>
      <Input
        type="date"
        name="joinedAt"
        defaultValue={current ?? ''}
        aria-label={de.team.joinDate}
        className="h-9 w-auto"
      />
      <SubmitButton variant="outline" size="sm">
        {de.team.saveJoinDate}
      </SubmitButton>
      {state.status === 'error' && state.message && (
        <span className="text-xs text-destructive">{state.message}</span>
      )}
      {state.status === 'success' && (
        <span className="text-xs text-emerald-600">✓</span>
      )}
    </form>
  );
}
