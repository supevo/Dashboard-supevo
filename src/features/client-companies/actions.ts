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
  createClientCompanySchema,
  updateClientCompanySchema,
} from './schema';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createClientCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createClientCompanySchema.safeParse({
    orgId: formData.get('orgId'),
    name: formData.get('name'),
    contactEmail: formData.get('contactEmail') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, name, contactEmail, notes } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('client_companies')
    .insert({
      organization_id: orgId,
      name,
      contact_email: contactEmail || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return errorResult('Ein Kundenunternehmen mit diesem Namen existiert bereits.');
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'create',
    entityType: 'client_company',
    entityId: data.id,
    metadata: { name },
  });

  revalidatePath('/app/clients');
  return successResult('Kundenunternehmen angelegt.');
}

export async function updateClientCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateClientCompanySchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    name: formData.get('name'),
    contactEmail: formData.get('contactEmail') ?? '',
    notes: formData.get('notes') ?? '',
    isActive: formData.get('isActive') ?? undefined,
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, clientCompanyId, name, contactEmail, notes, isActive } =
    parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_companies')
    .update({
      name,
      contact_email: contactEmail || null,
      notes: notes || null,
      ...(isActive ? { is_active: isActive === 'true' } : {}),
    })
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId);

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/app/clients');
  return successResult('Kundenunternehmen aktualisiert.');
}
