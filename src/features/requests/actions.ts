'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { generateTaskSuggestions } from './suggest';

const submitSchema = z.object({
  projectId: z.string().uuid(),
  body: z.string().trim().min(5, 'Bitte beschreibe dein Anliegen.').max(20000),
});

/**
 * A client submits a briefing for a project. Stored as a request, then the AI
 * splits it into task suggestions (best-effort). Agency staff of the project
 * are notified.
 */
export async function submitClientRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submitSchema.safeParse({
    projectId: formData.get('projectId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, body } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: project } = await supabase
    .from('projects')
    .select('organization_id, client_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return errorResult(de.errors.FORBIDDEN);

  const { data: request, error } = await supabase
    .from('client_requests')
    .insert({
      organization_id: project.organization_id,
      client_company_id: project.client_company_id,
      project_id: projectId,
      submitted_by: user.id,
      body,
    })
    .select('id')
    .single();
  if (error || !request) return errorResult(de.errors.FORBIDDEN);

  // AI suggestions (best-effort) stored via the service client.
  const suggestions = await generateTaskSuggestions(body);
  const service = createSupabaseServiceClient();
  if (suggestions.length > 0) {
    await service
      .from('client_requests')
      .update({ suggestions })
      .eq('id', request.id);
  }

  // Notify agency staff on the project.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);
  const recipients = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: project.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: 'Neues Briefing vom Kunden',
        body: body.slice(0, 140),
        entityType: 'project',
        entityId: projectId,
      })),
      user.id,
    );
  }

  revalidatePath(`/portal/projects/${projectId}`);
  return successResult('Briefing gesendet. Wir melden uns.');
}

const editSchema = z.object({
  requestId: z.string().uuid(),
  projectId: z.string().uuid(),
  body: z.string().trim().min(5, 'Bitte beschreibe dein Anliegen.').max(20000),
});

/**
 * The client edits their own briefing (while it is still "new"). RLS enforces
 * ownership + status; the AI suggestions are regenerated from the new text.
 */
export async function editClientRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = editSchema.safeParse({
    requestId: formData.get('requestId'),
    projectId: formData.get('projectId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { requestId, projectId, body } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('client_requests')
    .update({ body }, { count: 'exact' })
    .eq('id', requestId)
    .eq('status', 'new');
  if (error) return errorResult(de.errors.FORBIDDEN);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  // Refresh AI suggestions from the edited text (best-effort, service client).
  const suggestions = await generateTaskSuggestions(body);
  await createSupabaseServiceClient()
    .from('client_requests')
    .update({ suggestions })
    .eq('id', requestId);

  revalidatePath(`/portal/projects/${projectId}`);
  return successResult('Briefing aktualisiert.');
}

const acceptSchema = z.object({
  clientCompanyId: z.string().uuid(),
  requestId: z.string().uuid(),
  index: z.coerce.number().int().min(0).max(20),
  isInternal: z.enum(['true', 'false']).default('true'),
});

/** Agency turns one AI suggestion into a real task in the request's project. */
export async function acceptSuggestionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = acceptSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    requestId: formData.get('requestId'),
    index: formData.get('index'),
    isInternal: formData.get('isInternal') ?? 'true',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, requestId, index, isInternal } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: request } = await supabase
    .from('client_requests')
    .select('project_id, organization_id, suggestions')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return errorResult(de.errors.FORBIDDEN);
  const suggestion = request.suggestions?.[index];
  if (!suggestion) return errorResult(de.errors.NOT_FOUND);

  // Resolve the queue column of the project's board.
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', request.project_id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return errorResult(de.errors.INTERNAL);
  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return errorResult(de.errors.INTERNAL);

  const { data: maxRow } = await supabase
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('tasks').insert({
    organization_id: request.organization_id,
    project_id: request.project_id,
    board_id: board.id,
    column_id: target.id,
    title: suggestion.title,
    description: suggestion.description || null,
    priority: suggestion.priority,
    is_internal: isInternal === 'true',
    created_by: user.id,
    position: (maxRow?.position ?? 0) + 1000,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  await supabase
    .from('client_requests')
    .update({ status: 'processed' })
    .eq('id', requestId);

  await logActivity({
    actorId: user.id,
    organizationId: request.organization_id,
    action: 'create',
    entityType: 'task',
    entityId: requestId,
    metadata: { fromRequest: true },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath(`/app/projects/${request.project_id}`);
  return successResult('Aufgabe übernommen.');
}

const statusSchema = z.object({
  clientCompanyId: z.string().uuid(),
  requestId: z.string().uuid(),
  status: z.enum(['processed', 'dismissed', 'new']),
});

/** Agency updates a request's status (e.g. dismiss). */
export async function setRequestStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    requestId: formData.get('requestId'),
    status: formData.get('status'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('client_requests')
    .update({ status: parsed.data.status }, { count: 'exact' })
    .eq('id', parsed.data.requestId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Aktualisiert.');
}
