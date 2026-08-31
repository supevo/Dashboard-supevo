'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { createClientQueueTask } from '@/features/tasks/create-queue-task';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { logger } from '@/lib/logger';

const submitSchema = z.object({
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  projectId: z.string().uuid().optional().or(z.literal('')),
});

/** A client submits a new idea to their board. */
export async function submitIdeaAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submitSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    projectId: formData.get('projectId') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const { title, description, projectId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const company = await getMyClientCompany();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('client_ideas').insert({
    organization_id: company.organizationId,
    client_company_id: company.clientCompanyId,
    project_id: projectId ? projectId : null,
    title,
    description: description ? description : null,
    created_by: user.id,
  });
  if (error) {
    // Surface the real cause instead of a blanket "unerwarteter Fehler".
    logger.error('[ideas] submit insert failed', {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return errorResult(
      error.code === '42P01'
        ? 'Ideen-Tabelle fehlt (Migration 0087 nicht ausgeführt).'
        : de.errors.INTERNAL,
    );
  }

  revalidatePath('/portal/ideas');
  return successResult('Idee gespeichert.');
}

type PromoteResult = { ok: true } | { ok: false; error: string };

/**
 * The client promotes an open idea straight into the work queue: this creates a
 * client-visible task in the chosen project's queue column and marks the idea as
 * queued. Access is gated via RLS reads (idea + project must be visible to the
 * caller) before the service-client writes.
 */
export async function promoteIdeaToQueueAction(
  ideaId: string,
): Promise<PromoteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: de.errors.UNAUTHENTICATED };

  const rls = await createSupabaseServerClient();
  const { data: idea } = await rls
    .from('client_ideas')
    .select('id, title, description, status, project_id, organization_id')
    .eq('id', ideaId)
    .maybeSingle();
  if (!idea) return { ok: false, error: de.errors.NOT_FOUND };
  if (idea.status !== 'open') return { ok: false, error: 'Idee ist bereits in der Warteschlange.' };
  if (!idea.project_id) {
    return { ok: false, error: 'Bitte der Idee zuerst ein Projekt zuordnen.' };
  }

  // Access gate: the caller must be able to see the target project.
  const { data: project } = await rls
    .from('projects')
    .select('id, organization_id')
    .eq('id', idea.project_id)
    .maybeSingle();
  if (!project) return { ok: false, error: de.errors.FORBIDDEN };

  const taskId = await createClientQueueTask({
    projectId: project.id,
    organizationId: project.organization_id,
    title: idea.title,
    description: idea.description,
    createdBy: user.id,
  });
  if (!taskId) return { ok: false, error: de.errors.INTERNAL };

  await createSupabaseServiceClient()
    .from('client_ideas')
    .update({ status: 'queued', task_id: taskId })
    .eq('id', ideaId);

  revalidatePath('/portal/ideas');
  return { ok: true };
}
