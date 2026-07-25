'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  decideAbsenceAction,
  cancelAbsenceAction,
} from '@/features/absences/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';

/** Admin approve/reject controls for a pending request (with optional comment). */
export function AbsenceDecide({ id }: { id: string }) {
  const [state, action] = useActionState(decideAbsenceAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="comment"
        placeholder={de.absence.commentPlaceholder}
        className="h-8 w-40 text-sm"
      />
      <SubmitButton
        size="sm"
        name="decision"
        value="approved"
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        {de.absence.approve}
      </SubmitButton>
      <SubmitButton size="sm" variant="destructive" name="decision" value="rejected">
        {de.absence.reject}
      </SubmitButton>
    </form>
  );
}

/** Requester withdraws their own pending request. */
export function AbsenceCancel({ id }: { id: string }) {
  const [state, action] = useActionState(cancelAbsenceAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost">
        {de.absence.cancel}
      </SubmitButton>
    </form>
  );
}
