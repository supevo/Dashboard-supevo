'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestApprovalAction } from '@/features/approvals/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function RequestApprovalForm({
  projectId,
  taskId,
  defaultTitle,
}: {
  projectId: string;
  taskId: string;
  defaultTitle: string;
}) {
  const [state, action] = useActionState(requestApprovalAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{de.approvals.requested}</Alert>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Input name="title" defaultValue={defaultTitle} required />
      <SubmitButton size="sm" variant="outline">
        {de.approvals.request}
      </SubmitButton>
    </form>
  );
}
