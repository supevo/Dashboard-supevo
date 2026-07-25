'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addCommentAction } from '@/features/comments/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  MentionTextarea,
  type MentionMember,
} from '@/features/comments/components/mention-textarea';

export function CommentForm({
  orgId,
  projectId,
  taskId,
  allowInternal = true,
  members = [],
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  allowInternal?: boolean;
  members?: MentionMember[];
}) {
  const [state, formAction] = useActionState(addCommentAction, idleResult);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Bumping this key remounts the mention textarea to clear its internal state.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setResetKey((k) => k + 1);
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
      <MentionTextarea
        key={resetKey}
        name="body"
        placeholder={de.task.addComment}
        required
        members={members}
      />
      {members.length > 0 && (
        <p className="text-xs text-muted-foreground">{de.task.mentionHintShort}</p>
      )}
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
