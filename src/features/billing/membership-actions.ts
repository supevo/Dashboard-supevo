'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { isAgencyStaffInOrg } from '@/lib/authz/policies';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const optStr = z.string().trim().max(300).optional().or(z.literal(''));

// Stufe & Preis werden ausschließlich im Baukasten oben gesetzt
// (saveMembershipConfigAction), damit sich beide Bereiche nicht überschreiben.
// Dieses Formular ändert nur die Abrechnungs-Mechanik + Adresse + SEPA-Mandat.
const schema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  interval_months: z.coerce.number().int().refine((v) => [1, 3, 12].includes(v)),
  billing_day: z.coerce.number().int().min(1).max(28),
  payment_method: z.enum(['sepa', 'transfer']),
  status: z.enum(['active', 'paused', 'canceled']),
  start_date: z.string().min(1),
  auto_send: z.coerce.boolean(),
  mandate_reference: optStr,
  mandate_date: optStr,
  debtor_iban: optStr,
  debtor_bic: optStr,
  billing_name: optStr,
  billing_address_line1: optStr,
  billing_address_line2: optStr,
  billing_postal_code: optStr,
  billing_city: optStr,
  billing_country: optStr,
  billing_vat_id: optStr,
});

/** Computes the next billing date on/after today for a given day-of-month. */
function nextBillingDate(day: number): string {
  const now = new Date();
  const year = now.getFullYear();
  let month = now.getMonth();
  if (now.getDate() > day) month += 1;
  const d = new Date(Date.UTC(year, month, Math.min(day, 28)));
  return d.toISOString().slice(0, 10);
}

/** Creates or updates a client's membership (org admins only). Keeps the
 *  active-column WIP limit in sync with the chosen Stage. */
export async function upsertMembershipAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData.entries()),
    auto_send: formData.get('auto_send') === 'on',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'billing.manage', orgId: d.orgId });

  const supabase = await createSupabaseServerClient();

  // Nur die Abrechnungs-Mechanik + Adresse + Mandat. Stufe/Preis bleiben, wie sie
  // der Baukasten gesetzt hat – dieses Formular fasst sie nicht an.
  const fields = {
    interval_months: d.interval_months,
    billing_day: d.billing_day,
    payment_method: d.payment_method,
    status: d.status,
    start_date: d.start_date,
    next_invoice_date: nextBillingDate(d.billing_day),
    auto_send: d.auto_send,
    mandate_reference: d.mandate_reference || null,
    mandate_date: d.mandate_date || null,
    debtor_iban: d.debtor_iban || null,
    debtor_bic: d.debtor_bic || null,
    billing_name: d.billing_name || null,
    billing_address_line1: d.billing_address_line1 || null,
    billing_address_line2: d.billing_address_line2 || null,
    billing_postal_code: d.billing_postal_code || null,
    billing_city: d.billing_city || null,
    billing_country: d.billing_country || 'Deutschland',
    billing_vat_id: d.billing_vat_id || null,
  };

  const { data: existing } = await supabase
    .from('client_memberships')
    .select('id')
    .eq('client_company_id', d.clientCompanyId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from('client_memberships')
        .update(fields)
        .eq('client_company_id', d.clientCompanyId)
    : await supabase.from('client_memberships').insert({
        organization_id: d.orgId,
        client_company_id: d.clientCompanyId,
        // Default-Stufe; die richtige Stufe/Preis setzt der Baukasten oben.
        stage: 1,
        custom_name: null,
        custom_net_cents: null,
        ...fields,
      });
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: d.orgId,
    action: 'update',
    entityType: 'client_membership',
    entityId: d.clientCompanyId,
    metadata: { event: 'billing_details' },
  });

  revalidatePath(`/app/clients/${d.clientCompanyId}`);
  return successResult('Abrechnungsdetails gespeichert.');
}

const billingSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  interval_months: z.coerce.number().int().refine((v) => [1, 3, 12].includes(v)),
  billing_day: z.coerce.number().int().min(1).max(28),
  payment_method: z.enum(['sepa', 'transfer']),
  status: z.enum(['active', 'paused', 'canceled']),
  start_date: z.string().min(1),
  auto_send: z.coerce.boolean(),
  mandate_reference: optStr,
  mandate_date: optStr,
  debtor_iban: optStr,
  debtor_bic: optStr,
  billing_name: optStr,
  billing_address_line1: optStr,
  billing_address_line2: optStr,
  billing_postal_code: optStr,
  billing_city: optStr,
  billing_country: optStr,
  billing_vat_id: optStr,
});

/**
 * Speichert NUR Abrechnung + Rechnungsadresse + SEPA-Mandat (Wizard-Schritt 3).
 * Rührt Paket/Stage/Custompreis/Module NICHT an – die kommen aus dem Baukasten
 * (Schritt 2). Setzt voraus, dass die Mitgliedschaft bereits existiert.
 */
export async function saveMembershipBillingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = billingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const user = await requireUser();
  // Adresse/IBAN/SEPA gehören zum Onboarding und dürfen von allen Agentur-
  // Mitarbeitern gepflegt werden. Schreiben über den Service-Client (RLS ist
  // admin-only); Org-Bindung wird über die Mitgliedschaftszeile geprüft.
  if (!isAgencyStaffInOrg(user, d.orgId)) return errorResult(de.errors.FORBIDDEN);

  const supabase = createSupabaseServiceClient();
  const fields = {
    interval_months: d.interval_months,
    billing_day: d.billing_day,
    payment_method: d.payment_method,
    status: d.status,
    start_date: d.start_date,
    next_invoice_date: nextBillingDate(d.billing_day),
    auto_send: d.auto_send,
    mandate_reference: d.mandate_reference || null,
    mandate_date: d.mandate_date || null,
    debtor_iban: d.debtor_iban || null,
    debtor_bic: d.debtor_bic || null,
    billing_name: d.billing_name || null,
    billing_address_line1: d.billing_address_line1 || null,
    billing_address_line2: d.billing_address_line2 || null,
    billing_postal_code: d.billing_postal_code || null,
    billing_city: d.billing_city || null,
    billing_country: d.billing_country || 'Deutschland',
    billing_vat_id: d.billing_vat_id || null,
  };

  const { data: existing } = await supabase
    .from('client_memberships')
    .select('id, organization_id')
    .eq('client_company_id', d.clientCompanyId)
    .maybeSingle();

  if (existing) {
    if (existing.organization_id !== d.orgId) return errorResult(de.errors.NOT_FOUND);
    const { error } = await supabase
      .from('client_memberships')
      .update(fields)
      .eq('id', existing.id);
    if (error) return errorResult(de.errors.INTERNAL);
  } else {
    // Noch keine Mitgliedschaft vorhanden: eine anlegen, damit Rechnungsadresse
    // und Zahlweg auch für Kunden ohne konfiguriertes Paket (z. B. reine
    // Überweisung) hinterher änderbar sind. Paket/Stufe/Preis setzt die
    // Agenturleitung wie gewohnt im Baukasten – hier als Default Stufe 1 ohne
    // Custom-Preis, identisch zum Admin-Formular (upsertMembershipAction).
    const { data: company } = await supabase
      .from('client_companies')
      .select('organization_id')
      .eq('id', d.clientCompanyId)
      .maybeSingle();
    if (!company || company.organization_id !== d.orgId) {
      return errorResult(de.errors.NOT_FOUND);
    }
    const { error } = await supabase.from('client_memberships').insert({
      organization_id: d.orgId,
      client_company_id: d.clientCompanyId,
      stage: 1,
      custom_name: null,
      custom_net_cents: null,
      ...fields,
      // Kein automatischer Einzug, solange kein Paket konfiguriert ist – sonst
      // würde das bloße Speichern der Adresse eine Stufe-1-Abrechnung auslösen.
      // Die Agenturleitung plant die Abrechnung bewusst über den Baukasten.
      next_invoice_date: null,
    });
    if (error) return errorResult(de.errors.INTERNAL);
  }

  revalidatePath(`/app/clients/${d.clientCompanyId}`);
  return successResult('Abrechnung & SEPA gespeichert.');
}
