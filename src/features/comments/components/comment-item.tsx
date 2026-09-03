'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCommentAction, editCommentAction } from '@/features/comments/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import {
  MentionTextarea,
  type MentionMember,
} from '@/features/comments/components/mention-textarea';
import type { CommentView } from '@/features/comments/queries';

/** Fallback für Alt-Kommentare ohne gespeicherten Rohtext: gespeichertes HTML
 *  grob in schlichten Text bringen (Tags raus, ein paar Entities zurück). */
function toEditableText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function CommentItem({
  comment,
  hidePresence = false,
  members = [],
}: {
  comment: CommentView;
  /** Im Kundenportal wird der Anwesenheitsstatus der Mitarbeiter nicht gezeigt. */
  hidePresence?: boolean;
  /** Für die @Erwähnungs-Autovervollständigung beim Bearbeiten. */
  members?: MentionMember[];
}) {
  const [deleteState, deleteAction] = useActionState(deleteCommentAction, idleResult);
  const [editState, editAction] = useActionState(editCommentAction, idleResult);
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (deleteState.status === 'success') router.refresh();
  }, [deleteState, router]);

  useEffect(() => {
    if (editState.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [editState, router]);

  const editedLabel = comment.editedAt ? 'bearbeitet' : null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Avatar
            userId={comment.authorId}
            name={comment.authorName}
            hasAvatar={comment.authorHasAvatar}
            status={hidePresence ? null : comment.authorStatus}
            size="md"
          />
          <span>
            <span className="font-medium text-foreground">
              {comment.authorName}
            </span>{' '}
            · {new Date(comment.createdAt).toLocaleString('de-DE')}
            {editedLabel &&
              (comment.originalBody ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setShowOriginal((v) => !v)}
                    className="underline decoration-dotted hover:text-foreground"
                    title="Originalnachricht anzeigen"
                  >
                    {editedLabel}
                  </button>
                </>
              ) : (
                <> · {editedLabel}</>
              ))}
            {comment.isInternal && (
              <span className="ml-2 rounded bg-slate-200 px-1 text-slate-700">
                {de.task.internalComment}
              </span>
            )}
          </span>
        </span>
        {comment.canEdit && !editing && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Bearbeiten
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="commentId" value={comment.id} />
              <SubmitButton variant="ghost" size="sm">
                {de.task.delete}
              </SubmitButton>
            </form>
          </span>
        )}
      </div>

      {/* Originalfassung (vor der ersten Bearbeitung), einklappbar. */}
      {showOriginal && comment.originalBody && (
        <div className="mb-2 rounded-md border border-dashed bg-muted/30 p-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Original
          </p>
          <div
            className="prose prose-sm max-w-none text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: comment.originalBody }}
          />
        </div>
      )}

      {editing ? (
        <form action={editAction} className="space-y-2">
          {editState.status === 'error' && (
            <Alert variant="destructive">{editState.message}</Alert>
          )}
          <input type="hidden" name="commentId" value={comment.id} />
          <MentionTextarea
            name="body"
            members={members}
            initialValue={comment.bodySource ?? toEditableText(comment.body)}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <SubmitButton size="sm">Speichern</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        // Body is sanitized server-side before storage (see lib/sanitize).
        <div
          className="prose prose-sm max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: comment.body }}
        />
      )}
    </div>
  );
}
