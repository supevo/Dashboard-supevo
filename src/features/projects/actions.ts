'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
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
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      organization_id: orgId,
      client_company_id: clientCompanyId,
      name,
      description: description || null,
      status: 'active',
      lead_user_id: user.id,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !project) {
    return errorResult(de.errors.INTERNAL);
  }

  // Add the creator as project lead (the default board is created by trigger).
  await supabase.from('project_members').insert({
    project_id: project.id,
    user_id: user.id,
    role: 'lead',
  });

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    metadata: { name },
  });

  revalidatePath('/app/projects');
  return successResult('Projekt angelegt.', { projectId: project.id });
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
