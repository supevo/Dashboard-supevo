'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { decideApprovalAction } from '@/features/approvals/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function DecideApprovalForm({ approvalId }: { approvalId: string }) {
  const [state, action] = useActionState(decideApprovalAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="approvalId" value={approvalId} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="decision" defaultValue="approved" className="h-9 w-auto">
          <option value="approved">{de.approvals.approve}</option>
          <option value="changes_requested">
            {de.approvals.requestChanges}
          </option>
          <option value="rejected">{de.approvals.reject}</option>
        </Select>
        <SubmitButton size="sm">{de.approvals.decision}</SubmitButton>
      </div>
      <Textarea
        name="comment"
        placeholder={de.approvals.comment}
        className="min-h-16"
      />
      <p className="text-xs text-muted-foreground">
        {de.approvals.commentRequired}
      </p>
    </form>
  );
}
