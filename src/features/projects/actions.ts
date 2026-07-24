'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  archiveProjectSchema,
  createProjectSchema,
  updateProjectSchema,
} from './schema';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createProjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createProjectSchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, clientCompanyId, name, description } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'project.create', orgId });

  const supabase = await createSupabaseServerClient();

  // Generate the id client-side and insert WITHOUT a RETURNING (.select()).
  // The projects SELECT policy calls can_access_project(id), which re-queries
  // the projects table; as a STABLE function it cannot see the just-inserted
  // row within the same statement, so RETURNING the row would fail RLS (42501)
  // even though the INSERT WITH CHECK passes. Avoiding RETURNING sidesteps this.
  const projectId = randomUUID();
  const { error } = await supabase.from('projects').insert({
    id: projectId,
    organization_id: orgId,
    client_company_id: clientCompanyId,
    name,
    description: description || null,
    status: 'active',
    lead_user_id: user.id,
    created_by: user.id,
  });

  if (error) {
    logger.error('Projekt anlegen fehlgeschlagen', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === '42501') {
      return errorResult(
        'Dein Konto hat keine Berechtigung, in dieser Organisation Projekte anzulegen. Bitte prüfe deine Mitgliedschaft/Rolle (Admin).',
      );
    }
    return errorResult(de.errors.INTERNAL);
  }

  // Add the creator as project lead (the default board is created by trigger).
  const { error: memberError } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: user.id,
    role: 'lead',
  });
  if (memberError) {
    logger.error('project_members Insert fehlgeschlagen', {
      code: memberError.code,
      message: memberError.message,
    });
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'create',
    entityType: 'project',
    entityId: projectId,
    metadata: { name },
  });

  revalidatePath('/app/projects');
  return successResult('Projekt angelegt.', { projectId });
}

export async function updateProjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProjectSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    status: formData.get('status'),
    isClientVisible: formData.get('isClientVisible'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, projectId, name, description, status, isClientVisible } =
    parsed.data;

  const user = await requireUser();

  const supabase = await createSupabaseServerClient();
  // RLS (can_manage_project) is the hard guard; an unauthorized update affects
  // zero rows and returns an error we surface as "no permission".
  const { error, count } = await supabase
    .from('projects')
    .update(
      {
        name,
        description: description || null,
        status,
        is_client_visible: isClientVisible === 'true',
      },
      { count: 'exact' },
    )
    .eq('id', projectId)
    .eq('organization_id', orgId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'project',
    entityId: projectId,
    metadata: { status },
  });

  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath('/app/projects');
  return successResult('Projekt aktualisiert.');
}

export async function archiveProjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = archiveProjectSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, projectId } = parsed.data;

  const user = await requireUser();

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('projects')
    .update({ status: 'archived', deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', projectId)
    .eq('organization_id', orgId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'archive',
    entityType: 'project',
    entityId: projectId,
  });

  revalidatePath('/app/projects');
  return successResult('Projekt archiviert.');
}
