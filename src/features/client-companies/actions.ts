'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { hasClientAccess } from '@/features/auth/access';
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
  // Any agency staff member may add a client. The insert runs via the service
  // client because the client_companies RLS insert policy is admin-only.
  authorize(user, { type: 'clientCompany.create', orgId });

  const service = createSupabaseServiceClient();
  const { data, error } = await service
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

const updateClientProfileSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  contactEmail: z
    .string()
    .trim()
    .max(320)
    .email()
    .optional()
    .or(z.literal('')),
  industry: z.string().trim().max(500).optional().or(z.literal('')),
  brands: z.string().trim().max(2000).optional().or(z.literal('')),
  interests: z.string().trim().max(2000).optional().or(z.literal('')),
  expressTicketsPerMonth: z.coerce.number().int().min(0).max(10),
});

/** Updates a client's descriptive profile (industry, brands, interests). */
export async function updateClientProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateClientProfileSchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    contactEmail: formData.get('contactEmail') ?? '',
    industry: formData.get('industry') ?? '',
    brands: formData.get('brands') ?? '',
    interests: formData.get('interests') ?? '',
    expressTicketsPerMonth: formData.get('expressTicketsPerMonth') ?? 0,
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const {
    orgId,
    clientCompanyId,
    contactEmail,
    industry,
    brands,
    interests,
    expressTicketsPerMonth,
  } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_companies')
    .update({
      contact_email: contactEmail || null,
      industry: industry || null,
      brands: brands || null,
      interests: interests || null,
      express_tickets_per_month: expressTicketsPerMonth,
    })
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Kundenprofil gespeichert.');
}

const assignEntitySchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  billingEntityId: z.string().uuid().optional().or(z.literal('')),
});

/** Assigns the client to a billing entity (Rechnungssteller), or clears it. */
export async function assignClientBillingEntityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = assignEntitySchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    billingEntityId: formData.get('billingEntityId') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, clientCompanyId, billingEntityId } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  // Verify the target entity belongs to this org before assigning.
  if (billingEntityId) {
    const { data: entity } = await supabase
      .from('billing_entities')
      .select('id')
      .eq('id', billingEntityId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!entity) return errorResult(de.errors.NOT_FOUND);
  }

  const { error } = await supabase
    .from('client_companies')
    .update({ billing_entity_id: billingEntityId || null })
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Rechnungssteller zugeordnet.');
}

const myProfileSchema = z.object({
  industry: z.string().trim().max(500).optional().or(z.literal('')),
  brands: z.string().trim().max(2000).optional().or(z.literal('')),
  interests: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * Lets a client edit their own company profile (industry, brands, interests)
 * from the portal. Writes via the service client after confirming the caller is
 * a contact of the company; only the three descriptive fields are touched.
 */
export async function updateMyClientProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = myProfileSchema.safeParse({
    industry: formData.get('industry') ?? '',
    brands: formData.get('brands') ?? '',
    interests: formData.get('interests') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { industry, brands, interests } = parsed.data;

  const user = await requireUser();
  if (!hasClientAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('client_company_id')
    .limit(1)
    .maybeSingle();
  if (!contact) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('client_companies')
    .update({
      industry: industry || null,
      brands: brands || null,
      interests: interests || null,
    })
    .eq('id', contact.client_company_id);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/portal/profile');
  return successResult('Profil gespeichert.');
}
