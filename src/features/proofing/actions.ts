'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';
import { getVisibleFileMeta } from './queries';

const pointSchema = z.object({ x: z.number(), y: z.number() });
const strokeSchema = z.array(pointSchema).max(1000);
const addSchema = z.object({
  fileId: z.string().uuid(),
  comment: z.string().trim().max(2000).optional().or(z.literal('')),
  strokes: z.array(strokeSchema).max(60),
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Client (or agency) adds a freehand change request on an image. Access is
 * gated by the file's RLS (getVisibleFileMeta); the write uses the service
 * client. Agency staff on the project are notified.
 */
export async function addImageAnnotationAction(input: {
  fileId: string;
  comment: string;
  strokes: { x: number; y: number }[][];
}): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { fileId, comment, strokes } = parsed.data;
  if (strokes.length === 0 && !(comment ?? '').trim()) {
    return errorResult('Bitte etwas markieren oder einen Kommentar schreiben.');
  }

  const user = await requireUser();
  const meta = await getVisibleFileMeta(fileId);
  if (!meta) return errorResult(de.errors.FORBIDDEN);

  const cleanStrokes = strokes
    .map((s) => s.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })))
    .filter((s) => s.length > 0);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('image_annotations').insert({
    organization_id: meta.organizationId,
    file_id: fileId,
    task_id: meta.taskId,
    created_by: user.id,
    strokes: cleanStrokes,
    comment: (comment ?? '').trim() || null,
    status: 'open',
  });
  if (error) return errorResult(de.errors.INTERNAL);

  // Notify agency staff on the project about the change request.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', meta.projectId);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (recipients.length > 0 && meta.taskId) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: meta.organizationId,
        recipientId,
        type: 'client_comment' as const,
        title: 'Neue Bild-Markierung (Änderungswunsch)',
        body: (comment ?? '').trim().slice(0, 140) || 'Markierung im Entwurf',
        entityType: 'task',
        entityId: meta.taskId,
      })),
      user.id,
    );
  }

  if (meta.taskId) {
    revalidatePath(`/app/projects/${meta.projectId}/tasks/${meta.taskId}`);
    revalidatePath(`/portal/projects/${meta.projectId}/tasks/${meta.taskId}`);
  }
  return successResult('Änderungswunsch gesendet.');
}

/** Agency marks a change request as done / reopens it. */
export async function setAnnotationStatusAction(
  id: string,
  status: 'open' | 'done',
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('image_annotations')
    .update({ status, resolved_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  return successResult();
}

/** Deletes a change request (its creator, or agency staff). */
export async function deleteImageAnnotationAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const { data: ann } = await service
    .from('image_annotations')
    .select('created_by')
    .eq('id', id)
    .maybeSingle();
  if (!ann) return errorResult(de.errors.NOT_FOUND);
  if (ann.created_by !== user.id && !hasAgencyAccess(user)) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const { error } = await service.from('image_annotations').delete().eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  return successResult();
}
