'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  normalizeSelections,
  totalMonthlyCents,
  type PriceContext,
} from '@/features/memberships/modules';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const createSchema = z.object({
  contactName: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(200),
  company: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(60).optional().or(z.literal('')),
  source: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(4000).optional().or(z.literal('')),
  value: z.string().max(20).optional().or(z.literal('')),
});

function parseEuroToCents(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Creates a new lead in the pipeline (agency staff). */
export async function createLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    contactName: formData.get('contactName'),
    company: formData.get('company') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    source: formData.get('source') ?? '',
    note: formData.get('note') ?? '',
    value: formData.get('value') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').insert({
    organization_id: orgId,
    contact_name: d.contactName,
    company: d.company || null,
    email: d.email || null,
    phone: d.phone || null,
    source: d.source || null,
    note: d.note || null,
    estimated_value_cents: parseEuroToCents(d.value ?? ''),
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Lead angelegt.');
}

/** Moves a lead to another pipeline status. */
export async function setLeadStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(['new', 'contacted', 'offer', 'won', 'lost']),
    })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('leads')
    .update({ status: parsed.data.status }, { count: 'exact' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Status aktualisiert.');
}

const offerSelectionSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  qty: z.number().int().min(0).max(1000).optional(),
  budgetCents: z.number().int().min(0).max(100_000_00).optional(),
});
const saveOfferSchema = z.object({
  leadId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  selections: z.array(offerSelectionSchema).max(50),
});

/**
 * Saves the Onboarding-Angebot (module baukasten) on a lead. The offer's net
 * total is stored in estimated_value_cents so it also shows on the lead card.
 * RLS-scoped: the update only touches leads of the caller's agency org.
 */
export async function saveLeadOfferAction(input: unknown): Promise<ActionResult> {
  const parsed = saveOfferSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { leadId, name } = parsed.data;
  const selections = normalizeSelections(parsed.data.selections);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('organization_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return errorResult(de.errors.FORBIDDEN);

  const { data: s } = await createSupabaseServiceClient()
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', lead.organization_id)
    .maybeSingle();
  const ctx: PriceContext = {
    stage1NetCents: s?.stage1_net_cents ?? 0,
    stage2NetCents: s?.stage2_net_cents ?? 0,
  };
  const netCents = totalMonthlyCents(selections, ctx);

  const { error, count } = await supabase
    .from('leads')
    .update(
      {
        modules: selections as unknown,
        offer_name: name?.trim() || 'Individuell',
        estimated_value_cents: netCents,
      },
      { count: 'exact' },
    )
    .eq('id', leadId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  return successResult('Angebot gespeichert.');
}

/** Deletes a lead. */
export async function deleteLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/leads');
  return successResult('Lead gelöscht.');
}
