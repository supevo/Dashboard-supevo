'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { createNotifications } from '@/features/notifications/create';
import {
  sanitizeRichText,
  extractMentionUserIds,
  renderMentions,
} from '@/lib/sanitize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  addCommentSchema,
  commentIdSchema,
  editCommentSchema,
} from './schema';

export async function addCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addCommentSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    body: formData.get('body'),
    isInternal: formData.get('isInternal') ?? 'true',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, projectId, taskId, body, isInternal } = parsed.data;

  const user = await requireUser();
  const cleanBody = sanitizeRichText(body);
  if (!cleanBody) return errorResult(de.errors.VALIDATION);
  // Extract mentions from the raw token form, then store the prettified body.
  const mentionedIds = extractMentionUserIds(body);
  const storedBody = renderMentions(cleanBody);

  const supabase = await createSupabaseServerClient();
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      organization_id: orgId,
      project_id: projectId,
      task_id: taskId,
      author_id: user.id,
      body: storedBody,
      is_internal: isInternal === 'true',
    })
    .select('id')
    .single();

  if (error || !comment) return errorResult(de.errors.FORBIDDEN);

  // Mentions -> mention rows + notifications (never notify self).
  if (mentionedIds.length > 0) {
    await supabase.from('comment_mentions').insert(
      mentionedIds.map((uid) => ({
        comment_id: comment.id,
        mentioned_user_id: uid,
        organization_id: orgId,
      })),
    );
    await createNotifications(
      mentionedIds.map((uid) => ({
        organizationId: orgId,
        recipientId: uid,
        type: 'comment_mention' as const,
        title: 'Sie wurden in einem Kommentar erwähnt',
        entityType: 'task',
        entityId: taskId,
      })),
      user.id,
    );
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'comment',
    entityType: 'task',
    entityId: taskId,
    metadata: { commentId: comment.id, internal: isInternal === 'true' },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Kommentar hinzugefügt.');
}

export async function editCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = editCommentSchema.safeParse({
    commentId: formData.get('commentId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const cleanBody = sanitizeRichText(parsed.data.body);
  if (!cleanBody) return errorResult(de.errors.VALIDATION);
  const storedBody = renderMentions(cleanBody);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('comments')
    .update({ body: storedBody, edited_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', parsed.data.commentId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);
  return successResult('Kommentar aktualisiert.');
}

export async function deleteCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = commentIdSchema.safeParse({
    commentId: formData.get('commentId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', parsed.data.commentId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);
  return successResult('Kommentar gelöscht.');
}
