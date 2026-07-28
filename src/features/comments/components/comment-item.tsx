'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCommentAction } from '@/features/comments/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import { Avatar } from '@/components/ui/avatar';
import type { CommentView } from '@/features/comments/queries';

export function CommentItem({ comment }: { comment: CommentView }) {
  const [state, formAction] = useActionState(deleteCommentAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Avatar
            userId={comment.authorId}
            name={comment.authorName}
            hasAvatar={comment.authorHasAvatar}
            status={comment.authorStatus}
            size="md"
          />
          <span>
            <span className="font-medium text-foreground">
              {comment.authorName}
            </span>{' '}
            · {new Date(comment.createdAt).toLocaleString('de-DE')}
            {comment.editedAt ? ' · bearbeitet' : ''}
            {comment.isInternal && (
              <span className="ml-2 rounded bg-slate-200 px-1 text-slate-700">
                {de.task.internalComment}
              </span>
            )}
          </span>
        </span>
        {comment.canEdit && (
          <form action={formAction}>
            <input type="hidden" name="commentId" value={comment.id} />
            <SubmitButton variant="ghost" size="sm">
              {de.task.delete}
            </SubmitButton>
          </form>
        )}
      </div>
      {/* Body is sanitized server-side before storage (see lib/sanitize). */}
      <div
        className="prose prose-sm max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: comment.body }}
      />
    </div>
  );
}
