'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { isAgencyStaffInOrg, isOrgAdmin } from '@/lib/authz/policies';
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
import { invalidateClientNews } from '@/features/news/service';

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
    customerType: formData.get('customerType') ?? undefined,
    billingEntityId: formData.get('billingEntityId') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, name, contactEmail, notes, customerType, billingEntityId } =
    parsed.data;
  const isLegacy = customerType === 'legacy';

  const user = await requireUser();
  // Any agency staff member may add a client. The insert runs via the service
  // client because the client_companies RLS insert policy is admin-only.
  authorize(user, { type: 'clientCompany.create', orgId });

  const service = createSupabaseServiceClient();

  // Rechnungssteller nur setzen, wenn er zur selben Org gehört (Fremdzuordnung
  // verhindern). Leer → Standard-Rechnungssteller greift bei der Abrechnung.
  let entityId: string | null = null;
  if (billingEntityId) {
    const { data: entity } = await service
      .from('billing_entities')
      .select('id')
      .eq('id', billingEntityId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!entity) return errorResult(de.errors.NOT_FOUND);
    entityId = billingEntityId;
  }

  const { data, error } = await service
    .from('client_companies')
    .insert({
      organization_id: orgId,
      name,
      contact_email: contactEmail || null,
      notes: notes || null,
      is_legacy: isLegacy,
      billing_entity_id: entityId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return errorResult('Ein Kundenunternehmen mit diesem Namen existiert bereits.');
  }

  // Automatisch ein Produktions-Board anlegen: ein Projekt „Produktion" erzeugt
  // per Trigger ein Standard-Board (Warteschlange/Aktive/Überprüfung/Fertig);
  // dessen Board benennen wir in „Produktion". Best effort – ein Fehler hier darf
  // die Kundenanlage nicht scheitern lassen.
  try {
    const projectId = randomUUID();
    const { error: pErr } = await service.from('projects').insert({
      id: projectId,
      organization_id: orgId,
      client_company_id: data.id,
      name: 'Produktion',
      status: 'active',
      lead_user_id: user.id,
      created_by: user.id,
    });
    if (!pErr) {
      await service
        .from('boards')
        .update({ name: 'Produktion' })
        .eq('project_id', projectId);
      await service
        .from('project_members')
        .insert({ project_id: projectId, user_id: user.id, role: 'lead' });
    }
  } catch {
    // Board-Anlage ist optional – Kundenanlage bleibt erfolgreich.
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
  // Expose the new id so the guided wizard can advance to the membership step.
  return successResult('Kundenunternehmen angelegt.', { id: data.id });
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

const coreDataSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  name: z.string().min(2, 'Bitte gib einen Namen ein.').max(160),
  notes: z.string().max(2000).optional().or(z.literal('')),
  customerType: z.enum(['supevo', 'legacy']),
});

/**
 * Aktualisiert die Stammdaten eines Kunden (Name, Notizen, Kundentyp) – dieselben
 * Felder wie bei der Anlage. Fasst bewusst NUR diese Spalten an (E-Mail und
 * Rechnungssteller haben eigene Formulare) und überschreibt sonst nichts.
 */
export async function updateClientCoreDataAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = coreDataSchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    name: formData.get('name'),
    notes: formData.get('notes') ?? '',
    customerType: formData.get('customerType'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, clientCompanyId, name, notes, customerType } = parsed.data;

  const user = await requireUser();
  // Stamm-/Kontaktdaten dürfen alle Agentur-Mitarbeiter pflegen (sie legen auch
  // Kunden an). Der Kundentyp (supevo/Legacy) ist abrechnungsrelevant und bleibt
  // Admins vorbehalten – für Mitarbeiter wird er nicht verändert. Schreiben über
  // den Service-Client, da die client_companies-UPDATE-RLS admin-only ist.
  if (!isAgencyStaffInOrg(user, orgId)) return errorResult(de.errors.FORBIDDEN);
  const canEditType = isOrgAdmin(user, orgId);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('client_companies')
    .update({
      name,
      notes: notes || null,
      ...(canEditType ? { is_legacy: customerType === 'legacy' } : {}),
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
  return successResult('Stammdaten gespeichert.');
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
  // Kontakt-/Profildaten dürfen alle Agentur-Mitarbeiter pflegen. Schreiben über
  // den Service-Client, da die client_companies-UPDATE-RLS admin-only ist.
  if (!isAgencyStaffInOrg(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service
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

  // Branche/Marken/Interessen steuern die News → Cache verwerfen, damit die
  // News beim nächsten Portal-Aufruf mit den neuen Themen frisch geladen werden.
  await invalidateClientNews(clientCompanyId);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Kundenprofil gespeichert.');
}

const attentionFactorSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  attentionFactor: z.coerce.number().min(0.1).max(10),
});

/** Sets a client's fair-share weight for the health traffic light. */
export async function setClientAttentionFactorAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = attentionFactorSchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    attentionFactor: formData.get('attentionFactor'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, clientCompanyId, attentionFactor } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_companies')
    .update({ attention_factor: attentionFactor } as never)
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/app/clients');
  return successResult('Betreuungs-Faktor gespeichert.');
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
