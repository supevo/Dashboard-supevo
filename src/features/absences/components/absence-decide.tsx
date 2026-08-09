'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  decideAbsenceAction,
  cancelAbsenceAction,
} from '@/features/absences/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Admin approve/reject controls for a pending request (with optional comment).
 * The decision travels via hidden inputs in two sibling forms rather than the
 * submit button's name/value – form actions (useActionState) don't reliably
 * include the submitter's name/value in the FormData, which silently dropped
 * the decision and made the button appear to do nothing.
 */
export function AbsenceDecide({ id }: { id: string }) {
  const [state, action] = useActionState(decideAbsenceAction, idleResult);
  const [comment, setComment] = useState('');
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      {state.status === 'error' && (
        <Alert variant="destructive" className="w-full">
          {state.message}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={de.absence.commentPlaceholder}
          className="h-8 w-40 text-sm"
        />
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value="approved" />
          <input type="hidden" name="comment" value={comment} />
          <SubmitButton
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {de.absence.approve}
          </SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value="rejected" />
          <input type="hidden" name="comment" value={comment} />
          <SubmitButton size="sm" variant="destructive">
            {de.absence.reject}
          </SubmitButton>
        </form>
      </div>
    </div>
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
