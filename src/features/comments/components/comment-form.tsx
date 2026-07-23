'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addCommentAction } from '@/features/comments/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function CommentForm({
  orgId,
  projectId,
  taskId,
  allowInternal = true,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  allowInternal?: boolean;
}) {
  const [state, formAction] = useActionState(addCommentAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea name="body" placeholder={de.task.addComment} required />
      <p className="text-xs text-muted-foreground">{de.task.mentionHint}</p>
      <div className="flex items-center justify-between">
        {allowInternal ? (
          <Select name="isInternal" defaultValue="true" className="h-9 w-auto">
            <option value="true">{de.task.internalComment}</option>
            <option value="false">{de.task.externalComment}</option>
          </Select>
        ) : (
          <input type="hidden" name="isInternal" value="false" />
        )}
        <SubmitButton size="sm">{de.task.addComment}</SubmitButton>
      </div>
    </form>
  );
}
