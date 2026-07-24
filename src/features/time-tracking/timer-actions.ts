'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { logActivity } from '@/lib/audit';
import { minutesBetween } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/** Resolves a project's org + client company (RLS-guarded). */
async function resolveProject(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
): Promise<{ organizationId: string; clientCompanyId: string } | null> {
  const { data } = await supabase
    .from('projects')
    .select('organization_id, client_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!data) return null;
  return {
    organizationId: data.organization_id,
    clientCompanyId: data.client_company_id,
  };
}

/** Stops the user's running timer (if any). Returns the stopped entry id. */
async function stopRunningTimer(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<void> {
  const { data: running } = await supabase
    .from('time_entries')
    .select('id, started_at')
    .eq('user_id', userId)
    .eq('source', 'timer')
    .is('ended_at', null)
    .maybeSingle();
  if (!running) return;
  const now = new Date().toISOString();
  await supabase
    .from('time_entries')
    .update({
      ended_at: now,
      duration_minutes: Math.max(1, minutesBetween(running.started_at, now)),
    })
    .eq('id', running.id);
}

const startTimerSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
});

/** Starts a timer on a task; any existing running timer is stopped first
 *  (switch behaviour). */
export async function startTaskTimerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = startTimerSchema.safeParse({
    taskId: formData.get('taskId'),
    projectId: formData.get('projectId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  // Time tracking is an agency-internal tool. Access to the project is verified
  // via RLS in resolveProject below; agency membership is verified here.
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const supabase = await createSupabaseServerClient();
  const project = await resolveProject(supabase, parsed.data.projectId);
  if (!project) return errorResult(de.errors.FORBIDDEN);

  await stopRunningTimer(supabase, user.id);

  // Insert with the service client: the time_entries RLS requires
  // is_agency_staff(), which does not include super_admin. Access + role are
  // already checked above, so this is safe.
  const service = createSupabaseServiceClient();
  const { error } = await service.from('time_entries').insert({
    organization_id: project.organizationId,
    client_company_id: project.clientCompanyId,
    project_id: parsed.data.projectId,
    task_id: parsed.data.taskId,
    user_id: user.id,
    started_at: new Date().toISOString(),
    source: 'timer',
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/time');
  revalidatePath(`/app/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return successResult('Timer gestartet.');
}

export async function stopTimerAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await stopRunningTimer(supabase, user.id);
  revalidatePath('/app/time');
  return successResult('Timer gestoppt.');
}

const manualEntrySchema = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid().optional().or(z.literal('')),
    startedAt: z.string().min(1),
    endedAt: z.string().min(1),
    description: z.string().max(1000).optional().or(z.literal('')),
    isBillable: z.enum(['true', 'false']).default('true'),
  })
  .refine((d) => new Date(d.endedAt) > new Date(d.startedAt), {
    message: 'Ende muss nach dem Start liegen.',
    path: ['endedAt'],
  });

/** Adds a manual time entry. The DB exclusion constraint prevents overlaps. */
export async function addManualEntryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = manualEntrySchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId') ?? '',
    startedAt: formData.get('startedAt'),
    endedAt: formData.get('endedAt'),
    description: formData.get('description') ?? '',
    isBillable: formData.get('isBillable') ?? 'true',
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.endedAt?.[0] ?? de.errors.VALIDATION,
    );
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const supabase = await createSupabaseServerClient();
  const project = await resolveProject(supabase, d.projectId);
  if (!project) return errorResult(de.errors.FORBIDDEN);

  const startIso = new Date(d.startedAt).toISOString();
  const endIso = new Date(d.endedAt).toISOString();

  const service = createSupabaseServiceClient();
  const { error } = await service.from('time_entries').insert({
    organization_id: project.organizationId,
    client_company_id: project.clientCompanyId,
    project_id: d.projectId,
    task_id: d.taskId ? d.taskId : null,
    user_id: user.id,
    started_at: startIso,
    ended_at: endIso,
    duration_minutes: Math.max(1, minutesBetween(startIso, endIso)),
    description: d.description || null,
    is_billable: d.isBillable === 'true',
    source: 'manual',
    created_by: user.id,
  });
  if (error) {
    // 23P01 = exclusion (overlap) violation.
    if (error.code === '23P01') {
      return errorResult('Der Zeitraum überschneidet sich mit einem anderen Eintrag.');
    }
    return errorResult(de.errors.FORBIDDEN);
  }

  await logActivity({
    actorId: user.id,
    organizationId: project.organizationId,
    action: 'time_edit',
    entityType: 'time_entry',
    metadata: { manual: true },
  });

  revalidatePath('/app/time');
  return successResult('Zeiteintrag hinzugefügt.');
}

export async function deleteTimeEntryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const entryId = String(formData.get('entryId') ?? '');
  if (!z.string().uuid().safeParse(entryId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('time_entries')
    .delete({ count: 'exact' })
    .eq('id', entryId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'time_edit',
    entityType: 'time_entry',
    entityId: entryId,
    metadata: { deleted: true },
  });
  revalidatePath('/app/time');
  return successResult('Zeiteintrag gelöscht.');
}
