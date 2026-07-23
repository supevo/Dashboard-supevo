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
  assignLabelSchema,
  createLabelSchema,
  labelIdSchema,
  updateLabelSchema,
} from './schema';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createLabelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createLabelSchema.safeParse({
    orgId: formData.get('orgId'),
    name: formData.get('name'),
    color: formData.get('color'),
    description: formData.get('description') ?? '',
    isClientVisible: formData.get('isClientVisible') ?? 'false',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, name, color, description, isClientVisible } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'label.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('labels')
    .insert({
      organization_id: orgId,
      name,
      color,
      description: description || null,
      is_client_visible: isClientVisible === 'true',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return errorResult('Ein Label mit diesem Namen existiert bereits.');
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'create',
    entityType: 'label',
    entityId: data.id,
    metadata: { name },
  });

  revalidatePath('/app/settings/labels');
  return successResult('Label erstellt.');
}

export async function updateLabelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateLabelSchema.safeParse({
    orgId: formData.get('orgId'),
    labelId: formData.get('labelId'),
    name: formData.get('name'),
    color: formData.get('color'),
    description: formData.get('description') ?? '',
    isActive: formData.get('isActive'),
    isClientVisible: formData.get('isClientVisible'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, labelId, name, color, description, isActive, isClientVisible } =
    parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'label.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('labels')
    .update({
      name,
      color,
      description: description || null,
      is_active: isActive === 'true',
      is_client_visible: isClientVisible === 'true',
    })
    .eq('id', labelId)
    .eq('organization_id', orgId);

  if (error) return errorResult('Name bereits vergeben oder Fehler.');

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'label',
    entityId: labelId,
  });

  revalidatePath('/app/settings/labels');
  return successResult('Label aktualisiert.');
}

/** Deletes a label. task_labels cascade; tasks are never deleted. */
export async function deleteLabelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = labelIdSchema.safeParse({
    orgId: formData.get('orgId'),
    labelId: formData.get('labelId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, labelId } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'label.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('labels')
    .delete()
    .eq('id', labelId)
    .eq('organization_id', orgId);

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'delete',
    entityType: 'label',
    entityId: labelId,
  });

  revalidatePath('/app/settings/labels');
  return successResult('Label gelöscht.');
}

export async function assignLabelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = assignLabelSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    labelId: formData.get('labelId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, projectId, taskId, labelId } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Deactivated labels may not be newly assigned.
  const { data: label } = await supabase
    .from('labels')
    .select('is_active')
    .eq('id', labelId)
    .maybeSingle();
  if (!label) return errorResult(de.errors.NOT_FOUND);
  if (!label.is_active) {
    return errorResult('Deaktivierte Labels können nicht neu vergeben werden.');
  }

  const { error } = await supabase
    .from('task_labels')
    .insert({ task_id: taskId, label_id: labelId, organization_id: orgId });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Label zugewiesen.');
}

export async function removeLabelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = assignLabelSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    labelId: formData.get('labelId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, labelId } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('task_labels')
    .delete()
    .eq('task_id', taskId)
    .eq('label_id', labelId);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Label entfernt.');
}
