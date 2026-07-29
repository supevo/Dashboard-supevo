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
import {
  generateTaskSuggestions,
  generateClarifyingQuestions,
  generateTaskFromClarification,
  type TaskSuggestion,
} from './suggest';

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

/**
 * Step 1 of the guided briefing: stores the client's briefing and returns the
 * few clarifying questions the AI thinks are still missing before we can start.
 * The agency is notified about the new briefing right away.
 */
export async function startBriefingAction(
  projectId: string,
  body: string,
): Promise<{ ok: boolean; requestId?: string; questions?: string[]; error?: string }> {
  const parsed = submitSchema.safeParse({ projectId, body });
  if (!parsed.success) return { ok: false, error: 'Bitte beschreiben Sie Ihr Anliegen.' };

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: project } = await supabase
    .from('projects')
    .select('organization_id, client_company_id')
    .eq('id', parsed.data.projectId)
    .maybeSingle();
  if (!project) return { ok: false, error: de.errors.FORBIDDEN };

  const { data: request, error } = await supabase
    .from('client_requests')
    .insert({
      organization_id: project.organization_id,
      client_company_id: project.client_company_id,
      project_id: parsed.data.projectId,
      submitted_by: user.id,
      body: parsed.data.body,
    })
    .select('id')
    .single();
  if (error || !request) return { ok: false, error: de.errors.FORBIDDEN };

  const service = createSupabaseServiceClient();
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', parsed.data.projectId);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: project.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: 'Neues Briefing vom Kunden',
        body: parsed.data.body.slice(0, 140),
        entityType: 'project',
        entityId: parsed.data.projectId,
      })),
      user.id,
    );
  }

  const questions = await generateClarifyingQuestions(parsed.data.body);
  revalidatePath(`/portal/projects/${parsed.data.projectId}`);
  return { ok: true, requestId: request.id, questions };
}

const finishBriefingSchema = z.object({
  requestId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        question: z.string().trim().max(300),
        answer: z.string().trim().max(2000),
      }),
    )
    .max(6)
    .default([]),
});

/**
 * Step 2 of the guided briefing: the client's answers to the clarifying
 * questions. The AI turns briefing + answers into ONE ready-to-work task,
 * created in the project's queue (service client – clients can't insert tasks
 * under RLS). The briefing is marked processed and the agency is notified.
 */
export async function finishBriefingAction(input: {
  requestId: string;
  answers: { question: string; answer: string }[];
}): Promise<ActionResult> {
  const parsed = finishBriefingSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { requestId, answers } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS gate: the client can only read their own briefing.
  const { data: request } = await supabase
    .from('client_requests')
    .select('project_id, organization_id, body, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return errorResult(de.errors.FORBIDDEN);
  if (request.status !== 'new') {
    return errorResult('Dieses Briefing wurde bereits verarbeitet.');
  }

  let suggestion = await generateTaskFromClarification(request.body, answers);
  if (!suggestion) {
    // AI off/failed → build a plain but clearly laid-out task from the briefing.
    const firstLine =
      request.body.split('\n').find((l) => l.trim())?.trim().slice(0, 120) ||
      'Kunden-Briefing';
    const answered = answers
      .filter((a) => a.answer.trim())
      .map((a) => `- ${a.question} ${a.answer}`)
      .join('\n');
    const description = [
      `Ziel:\n${request.body.trim()}`,
      answered ? `Weitere Angaben:\n${answered}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    suggestion = { title: firstLine, description, priority: 'medium' };
  }

  const service = createSupabaseServiceClient();
  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', request.project_id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return errorResult(de.errors.INTERNAL);
  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return errorResult(de.errors.INTERNAL);
  const { data: maxRow } = await service
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insErr } = await service.from('tasks').insert({
    organization_id: request.organization_id,
    project_id: request.project_id,
    board_id: board.id,
    column_id: target.id,
    title: suggestion.title,
    description: suggestion.description || null,
    priority: suggestion.priority,
    is_internal: false,
    created_by: user.id,
    position: (maxRow?.position ?? 0) + 1000,
  });
  if (insErr) return errorResult(de.errors.INTERNAL);

  // Append the Q&A to the briefing (for the record) and mark it processed.
  const qaBlock = answers
    .filter((a) => a.answer.trim())
    .map((a) => `\n\n**${a.question}**\n${a.answer}`)
    .join('');
  await service
    .from('client_requests')
    .update({ status: 'processed', body: request.body + qaBlock })
    .eq('id', requestId);

  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', request.project_id);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: request.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: 'Aufgabe aus Briefing erstellt',
        body: suggestion.title.slice(0, 140),
        entityType: 'project',
        entityId: request.project_id,
      })),
      user.id,
    );
  }

  await logActivity({
    actorId: user.id,
    organizationId: request.organization_id,
    action: 'create',
    entityType: 'task',
    entityId: requestId,
    metadata: { fromBriefing: true, clientDriven: true, answered: answers.length },
  });

  revalidatePath(`/portal/projects/${request.project_id}`);
  return successResult('Danke! Wir haben eine Aufgabe daraus erstellt und legen los.');
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

/**
 * Reads a client briefing and returns the few most important clarifying
 * questions the AI thinks are still missing (format, intention, deadline …).
 * RLS gates the read; agency staff of the org can see the request.
 */
export async function getClarifyingQuestionsForRequest(
  requestId: string,
): Promise<{ ok: boolean; questions: string[]; error?: string }> {
  const parsed = z.string().uuid().safeParse(requestId);
  if (!parsed.success) {
    return { ok: false, questions: [], error: de.errors.VALIDATION };
  }

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: request } = await supabase
    .from('client_requests')
    .select('body')
    .eq('id', parsed.data)
    .maybeSingle();
  if (!request) return { ok: false, questions: [], error: de.errors.NOT_FOUND };

  const questions = await generateClarifyingQuestions(request.body);
  return { ok: true, questions };
}

/** Inserts a suggestion as a real task into a project's queue column. */
async function insertTaskInQueue(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  args: {
    organizationId: string;
    projectId: string;
    suggestion: TaskSuggestion;
    isInternal: boolean;
    userId: string;
  },
): Promise<boolean> {
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', args.projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return false;

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return false;

  const { data: maxRow } = await supabase
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('tasks').insert({
    organization_id: args.organizationId,
    project_id: args.projectId,
    board_id: board.id,
    column_id: target.id,
    title: args.suggestion.title,
    description: args.suggestion.description || null,
    priority: args.suggestion.priority,
    is_internal: args.isInternal,
    created_by: args.userId,
    position: (maxRow?.position ?? 0) + 1000,
  });
  return !error;
}

const clarifyTaskSchema = z.object({
  requestId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  isInternal: z.boolean().default(true),
  answers: z
    .array(
      z.object({
        question: z.string().trim().max(300),
        answer: z.string().trim().max(2000),
      }),
    )
    .max(6)
    .default([]),
});

/**
 * Turns a briefing + the agency's clarification answers into ONE well-specified
 * task via the AI, then creates it in the project's queue and marks the request
 * processed. Falls back to a plain task built from the briefing if AI is off.
 */
export async function createTaskFromBriefingAction(input: {
  requestId: string;
  clientCompanyId: string;
  isInternal: boolean;
  answers: { question: string; answer: string }[];
}): Promise<ActionResult> {
  const parsed = clarifyTaskSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { requestId, clientCompanyId, isInternal, answers } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: request } = await supabase
    .from('client_requests')
    .select('project_id, organization_id, body')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return errorResult(de.errors.FORBIDDEN);

  let suggestion = await generateTaskFromClarification(request.body, answers);
  if (!suggestion) {
    // AI off/failed: build a plain task from the briefing + any answers.
    const firstLine =
      request.body.split('\n').find((l) => l.trim())?.trim().slice(0, 120) ||
      'Kunden-Briefing';
    const answered = answers
      .filter((a) => a.answer.trim())
      .map((a) => `• ${a.question} ${a.answer}`)
      .join('\n');
    suggestion = {
      title: firstLine,
      description: [request.body, answered].filter(Boolean).join('\n\n'),
      priority: 'medium',
    };
  }

  const ok = await insertTaskInQueue(supabase, {
    organizationId: request.organization_id,
    projectId: request.project_id,
    suggestion,
    isInternal,
    userId: user.id,
  });
  if (!ok) return errorResult(de.errors.FORBIDDEN);

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
    metadata: { fromRequest: true, clarified: answers.length },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath(`/app/projects/${request.project_id}`);
  return successResult('Aufgabe aus Briefing erstellt.');
}

const deleteSchema = z.object({
  clientCompanyId: z.string().uuid(),
  requestId: z.string().uuid(),
});

/**
 * Permanently deletes a client briefing. RLS-gates the read (so only agency
 * staff who may see the request get past it), then the service client removes
 * the row.
 */
export async function deleteClientRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    requestId: formData.get('requestId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, requestId } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: req } = await supabase
    .from('client_requests')
    .select('id, organization_id')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return errorResult(de.errors.FORBIDDEN);

  const { error } = await createSupabaseServiceClient()
    .from('client_requests')
    .delete()
    .eq('id', requestId);
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: req.organization_id,
    action: 'delete',
    entityType: 'client_request',
    entityId: requestId,
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Briefing gelöscht.');
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
