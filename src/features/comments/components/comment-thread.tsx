'use client';

import { useState } from 'react';
import { de } from '@/lib/i18n/de';
import { CommentForm } from '@/features/comments/components/comment-form';
import { CommentItem } from '@/features/comments/components/comment-item';
import type { MentionMember } from '@/features/comments/components/mention-textarea';
import type { CommentView } from '@/features/comments/queries';

/**
 * Kommentarbereich mit einer Antwortebene: oben das Eingabefeld für neue
 * Top-Level-Kommentare, darunter die Kommentare; Antworten werden eingerückt
 * unter ihrem Eltern-Kommentar gruppiert. „Antworten" öffnet ein Inline-Feld.
 */
export function CommentThread({
  orgId,
  projectId,
  taskId,
  comments,
  members = [],
  allowInternal = true,
  hidePresence = false,
}: {
  orgId: string;
  projectId: string;
  taskId: string;
  comments: CommentView[];
  members?: MentionMember[];
  allowInternal?: boolean;
  hidePresence?: boolean;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, CommentView[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  return (
    <div className="space-y-4">
      <CommentForm
        orgId={orgId}
        projectId={projectId}
        taskId={taskId}
        members={members}
        allowInternal={allowInternal}
      />

      {topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.task.noComments}</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c) => {
            const replies = repliesByParent.get(c.id) ?? [];
            return (
              <div key={c.id} className="space-y-2">
                <CommentItem comment={c} hidePresence={hidePresence} members={members} />

                {(replies.length > 0 || replyTo === c.id) && (
                  <div className="ml-4 space-y-2 border-l pl-4">
                    {replies.map((r) => (
                      <CommentItem
                        key={r.id}
                        comment={r}
                        hidePresence={hidePresence}
                        members={members}
                      />
                    ))}
                    {replyTo === c.id && (
                      <CommentForm
                        orgId={orgId}
                        projectId={projectId}
                        taskId={taskId}
                        parentCommentId={c.id}
                        members={members}
                        allowInternal={allowInternal}
                        compact
                        onDone={() => setReplyTo(null)}
                      />
                    )}
                  </div>
                )}

                {replyTo !== c.id && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(c.id)}
                    className="ml-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Antworten
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
