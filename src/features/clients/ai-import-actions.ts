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
import { extractClients, fetchWebsiteText } from '@/features/clients/ai-import';

const analyzeSchema = z.object({
  orgId: z.string().uuid(),
  mode: z.enum(['text', 'url']),
  text: z.string().max(20_000).optional().or(z.literal('')),
  url: z.string().url().optional().or(z.literal('')),
});

/**
 * Analyzes pasted text or a website URL and returns the extracted clients in
 * `data.clients` for the reviewer. Never writes anything.
 */
export async function analyzeClientImportAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = analyzeSchema.safeParse({
    orgId: formData.get('orgId'),
    mode: formData.get('mode'),
    text: formData.get('text') ?? '',
    url: formData.get('url') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, mode, text, url } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  let source = text ?? '';
  if (mode === 'url') {
    if (!url) return errorResult('Bitte eine gültige URL angeben.');
    const fetched = await fetchWebsiteText(url);
    if (!fetched) {
      return errorResult('Die Website konnte nicht geladen werden.');
    }
    source = `Quelle: ${url}\n\n${fetched}`;
  }
  if (!source.trim()) return errorResult('Bitte Daten zum Auswerten eingeben.');

  const result = await extractClients(source);
  if (result.clients.length === 0) {
    return errorResult(result.warning ?? 'Es konnten keine Daten erkannt werden.');
  }

  return successResult(
    `${result.clients.length} Kunde(n) erkannt. Bitte prüfen und speichern.`,
    { clients: result.clients },
  );
}

const optStr = z.string().trim().max(300).optional().or(z.literal(''));

const createSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  contact_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().max(4000).optional().or(z.literal('')),
  billing_entity_id: z.string().uuid().optional().or(z.literal('')),
  create_membership: z.coerce.boolean(),
  stage: z.coerce.number().int().min(1).max(2).optional(),
  interval_months: z.coerce.number().int().optional(),
  payment_method: z.enum(['sepa', 'transfer']).optional().or(z.literal('')),
  iban: optStr,
  mandate_reference: optStr,
  mandate_date: optStr,
  billing_name: optStr,
  billing_address_line1: optStr,
  billing_address_line2: optStr,
  billing_postal_code: optStr,
  billing_city: optStr,
  billing_country: optStr,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Creates one reviewed client (and, optionally, its membership) from the import
 * wizard. All values come from the editable review form, not directly from the
 * AI, so a human has confirmed them.
 */
export async function createImportedClientAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    create_membership: formData.get('create_membership') === 'on',
  });
  if (!parsed.success) {
    return errorResult('Bitte mindestens einen gültigen Firmennamen angeben.');
  }
  const d = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId: d.orgId });

  const supabase = await createSupabaseServerClient();

  // Confirm the billing entity belongs to this org.
  let entityId: string | null = null;
  if (d.billing_entity_id) {
    const { data: entity } = await supabase
      .from('billing_entities')
      .select('id')
      .eq('id', d.billing_entity_id)
      .eq('organization_id', d.orgId)
      .maybeSingle();
    entityId = entity?.id ?? null;
  }

  const { data: created, error } = await supabase
    .from('client_companies')
    .insert({
      organization_id: d.orgId,
      name: d.name,
      contact_email: d.contact_email || null,
      notes: d.notes || null,
      billing_entity_id: entityId,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !created) {
    return errorResult('Ein Kunde mit diesem Namen existiert bereits.');
  }

  await logActivity({
    actorId: user.id,
    organizationId: d.orgId,
    action: 'create',
    entityType: 'client_company',
    entityId: created.id,
    metadata: { name: d.name, source: 'ai-import' },
  });

  // Optionally seed the membership when the reviewer confirmed the plan.
  if (d.create_membership && d.stage && d.interval_months && d.payment_method) {
    const interval = [1, 3, 12].includes(d.interval_months)
      ? d.interval_months
      : 1;
    await supabase.from('client_memberships').upsert(
      {
        organization_id: d.orgId,
        client_company_id: created.id,
        stage: d.stage,
        custom_name: null,
        custom_net_cents: null,
        interval_months: interval,
        billing_day: 1,
        payment_method: d.payment_method,
        status: 'active',
        start_date: todayIso(),
        next_invoice_date: todayIso(),
        auto_send: false,
        mandate_reference: d.mandate_reference || null,
        mandate_date: d.mandate_date || null,
        debtor_iban: d.iban || null,
        billing_name: d.billing_name || d.name,
        billing_address_line1: d.billing_address_line1 || null,
        billing_address_line2: d.billing_address_line2 || null,
        billing_postal_code: d.billing_postal_code || null,
        billing_city: d.billing_city || null,
        billing_country: d.billing_country || 'Deutschland',
      },
      { onConflict: 'client_company_id' },
    );
  }

  revalidatePath('/app/clients');
  return successResult('Kunde angelegt.', { clientCompanyId: created.id });
}
