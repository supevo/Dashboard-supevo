'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { parseEuroToCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const str = z.string().trim().max(300).optional().or(z.literal(''));

const schema = z.object({
  orgId: z.string().uuid(),
  company_name: str,
  address_line1: str,
  address_line2: str,
  postal_code: str,
  city: str,
  country: str,
  vat_id: str,
  tax_number: str,
  contact_email: str,
  phone: str,
  website: str,
  iban: str,
  bic: str,
  bank_name: str,
  creditor_id: str,
  invoice_prefix: z.string().trim().max(20).optional().or(z.literal('')),
  invoice_next_number: z.coerce.number().int().min(1).max(1_000_000),
  invoice_number_padding: z.coerce.number().int().min(1).max(10),
  invoice_reset_yearly: z.coerce.boolean(),
  default_tax_rate: z.coerce.number().min(0).max(99.99),
  small_business: z.coerce.boolean(),
  payment_terms_text: z.string().trim().max(500).optional().or(z.literal('')),
  invoice_footer: z.string().trim().max(1000).optional().or(z.literal('')),
  stage1_name: z.string().trim().min(1).max(120),
  stage1_price: z.string(),
  stage2_name: z.string().trim().min(1).max(120),
  stage2_price: z.string(),
  stage1_benefits: z.string().trim().max(2000).optional().or(z.literal('')),
  stage2_benefits: z.string().trim().max(2000).optional().or(z.literal('')),
});

/** Creates or updates the organization's billing settings (org admins only). */
export async function updateBillingSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  // Checkboxes are absent when unchecked.
  const parsed = schema.safeParse({
    ...raw,
    invoice_reset_yearly: formData.get('invoice_reset_yearly') === 'on',
    small_business: formData.get('small_business') === 'on',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const stage1 = parseEuroToCents(d.stage1_price);
  const stage2 = parseEuroToCents(d.stage2_price);
  if (stage1 == null || stage2 == null) {
    return errorResult('Bitte gültige Preise für Stage 1 und Stage 2 angeben.');
  }

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: d.orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('billing_settings').upsert(
    {
      organization_id: d.orgId,
      company_name: d.company_name || null,
      address_line1: d.address_line1 || null,
      address_line2: d.address_line2 || null,
      postal_code: d.postal_code || null,
      city: d.city || null,
      country: d.country || 'Deutschland',
      vat_id: d.vat_id || null,
      tax_number: d.tax_number || null,
      contact_email: d.contact_email || null,
      phone: d.phone || null,
      website: d.website || null,
      iban: d.iban || null,
      bic: d.bic || null,
      bank_name: d.bank_name || null,
      creditor_id: d.creditor_id || null,
      invoice_prefix: d.invoice_prefix || '',
      invoice_next_number: d.invoice_next_number,
      invoice_number_padding: d.invoice_number_padding,
      invoice_reset_yearly: d.invoice_reset_yearly,
      default_tax_rate: d.default_tax_rate,
      small_business: d.small_business,
      payment_terms_text: d.payment_terms_text || 'Zahlbar sofort ohne Abzug.',
      invoice_footer: d.invoice_footer || null,
      stage1_name: d.stage1_name,
      stage1_net_cents: stage1,
      stage2_name: d.stage2_name,
      stage2_net_cents: stage2,
      stage1_benefits: d.stage1_benefits || null,
      stage2_benefits: d.stage2_benefits || null,
    },
    { onConflict: 'organization_id' },
  );

  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult('Rechnungseinstellungen gespeichert.');
}

// ---------------------------------------------------------------------------
// Billing entities (Rechnungssteller) — multiple legal senders per org.
// ---------------------------------------------------------------------------

const entitySchema = schema.extend({
  id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(1).max(120),
  is_default: z.coerce.boolean(),
});

/** Creates or updates one billing entity (Rechnungssteller). Org admins only. */
export async function upsertBillingEntityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = entitySchema.safeParse({
    ...raw,
    invoice_reset_yearly: formData.get('invoice_reset_yearly') === 'on',
    small_business: formData.get('small_business') === 'on',
    is_default: formData.get('is_default') === 'on',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const stage1 = parseEuroToCents(d.stage1_price);
  const stage2 = parseEuroToCents(d.stage2_price);
  if (stage1 == null || stage2 == null) {
    return errorResult('Bitte gültige Preise für Stage 1 und Stage 2 angeben.');
  }

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: d.orgId });

  const supabase = await createSupabaseServerClient();
  const values = {
    organization_id: d.orgId,
    name: d.name,
    is_default: d.is_default,
    company_name: d.company_name || null,
    address_line1: d.address_line1 || null,
    address_line2: d.address_line2 || null,
    postal_code: d.postal_code || null,
    city: d.city || null,
    country: d.country || 'Deutschland',
    vat_id: d.vat_id || null,
    tax_number: d.tax_number || null,
    contact_email: d.contact_email || null,
    phone: d.phone || null,
    website: d.website || null,
    iban: d.iban || null,
    bic: d.bic || null,
    bank_name: d.bank_name || null,
    creditor_id: d.creditor_id || null,
    invoice_prefix: d.invoice_prefix || '',
    invoice_next_number: d.invoice_next_number,
    invoice_number_padding: d.invoice_number_padding,
    invoice_reset_yearly: d.invoice_reset_yearly,
    default_tax_rate: d.default_tax_rate,
    small_business: d.small_business,
    payment_terms_text: d.payment_terms_text || 'Zahlbar sofort ohne Abzug.',
    invoice_footer: d.invoice_footer || null,
    stage1_name: d.stage1_name,
    stage1_net_cents: stage1,
    stage2_name: d.stage2_name,
    stage2_net_cents: stage2,
  };

  let entityId = d.id || null;
  if (entityId) {
    const { error } = await supabase
      .from('billing_entities')
      .update(values)
      .eq('id', entityId)
      .eq('organization_id', d.orgId);
    if (error) return errorResult(de.errors.INTERNAL);
  } else {
    const { data, error } = await supabase
      .from('billing_entities')
      .insert(values)
      .select('id')
      .single();
    if (error || !data) return errorResult(de.errors.INTERNAL);
    entityId = data.id;
  }

  // Exactly one default per org: clear the flag on the others.
  if (d.is_default && entityId) {
    await supabase
      .from('billing_entities')
      .update({ is_default: false })
      .eq('organization_id', d.orgId)
      .neq('id', entityId);
  }

  revalidatePath('/app/finance');
  return successResult('Rechnungssteller gespeichert.');
}

const entityIdSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

/** Deletes a billing entity. The org's default entity cannot be deleted. */
export async function deleteBillingEntityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = entityIdSchema.safeParse({
    id: formData.get('id'),
    orgId: formData.get('orgId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: parsed.data.orgId });

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('is_default')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.NOT_FOUND);
  if (entity.is_default) {
    return errorResult('Der Standard-Rechnungssteller kann nicht gelöscht werden.');
  }

  const { error } = await supabase
    .from('billing_entities')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', parsed.data.orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult('Rechnungssteller gelöscht.');
}
