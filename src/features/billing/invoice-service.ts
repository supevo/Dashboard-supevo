import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { BillingSettings } from '@/features/billing/queries';
import type { ClientMembership } from '@/features/billing/membership';
import { effectiveMonthlyCents, membershipLabel } from '@/features/billing/membership';

export interface InvoiceAmounts {
  netCents: number;
  taxRate: number;
  taxCents: number;
  grossCents: number;
}

/** Net/tax/gross for a net amount. Small-business (§19) => no VAT. */
export function computeAmounts(
  netCents: number,
  taxRate: number,
  smallBusiness: boolean,
): InvoiceAmounts {
  const rate = smallBusiness ? 0 : taxRate;
  const taxCents = Math.round((netCents * rate) / 100);
  return { netCents, taxRate: rate, taxCents, grossCents: netCents + taxCents };
}

/** Calendar-month range [start, end] (inclusive end) for `interval_months`. */
export function servicePeriod(
  refDate: Date,
  intervalMonths: number,
): { start: string; end: string } {
  const start = new Date(
    Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + intervalMonths, 0),
  );
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Creates a DRAFT invoice (with one line item) from a membership. No number is
 * assigned yet — that happens at finalization to keep numbering gapless.
 */
export async function createDraftInvoice(params: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  clientCompanyId: string;
  membership: ClientMembership;
  settings: BillingSettings | null;
  createdBy: string;
  refDate?: Date;
}): Promise<{ invoiceId: string } | { error: string }> {
  const { supabase, orgId, clientCompanyId, membership, settings, createdBy } =
    params;
  const refDate = params.refDate ?? new Date();

  const monthly = effectiveMonthlyCents(membership, settings);
  const netCents = monthly * membership.interval_months;
  const taxRate = settings?.default_tax_rate ?? 19;
  const smallBusiness = settings?.small_business ?? false;
  const amounts = computeAmounts(netCents, taxRate, smallBusiness);
  const period = servicePeriod(refDate, membership.interval_months);
  const label = membershipLabel(membership, settings);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      client_company_id: clientCompanyId,
      membership_id: membership.id,
      status: 'draft',
      service_period_start: period.start,
      service_period_end: period.end,
      currency: 'EUR',
      net_cents: amounts.netCents,
      tax_rate: amounts.taxRate,
      tax_cents: amounts.taxCents,
      gross_cents: amounts.grossCents,
      payment_method: membership.payment_method,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !invoice) return { error: error?.message ?? 'insert failed' };

  const description =
    membership.interval_months === 1
      ? `${label} – Leistungszeitraum ${formatDe(period.start)}–${formatDe(period.end)}`
      : `${label} (${membership.interval_months} Monate) – ${formatDe(period.start)}–${formatDe(period.end)}`;

  await supabase.from('invoice_items').insert({
    invoice_id: invoice.id,
    position: 1,
    description,
    quantity: 1,
    unit_net_cents: amounts.netCents,
    tax_rate: amounts.taxRate,
    net_cents: amounts.netCents,
  });

  return { invoiceId: invoice.id };
}

/**
 * Assigns the next gapless invoice number for the org from billing_settings,
 * honouring prefix, zero-padding and optional yearly reset. Advances the
 * counter. Returns the formatted number.
 */
export async function assignInvoiceNumber(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<{ number: string } | { error: string }> {
  const { data: s } = await supabase
    .from('billing_settings')
    .select(
      'invoice_prefix, invoice_next_number, invoice_number_padding, invoice_reset_yearly, invoice_number_year',
    )
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!s) return { error: 'no billing settings' };

  const year = new Date().getFullYear();
  let next = s.invoice_next_number;
  if (s.invoice_reset_yearly && s.invoice_number_year !== year) {
    next = 1; // new year → restart
  }

  const seq = String(next).padStart(s.invoice_number_padding, '0');
  const number = s.invoice_reset_yearly
    ? `${s.invoice_prefix}${year}-${seq}`
    : `${s.invoice_prefix}${seq}`;

  const { error } = await supabase
    .from('billing_settings')
    .update({ invoice_next_number: next + 1, invoice_number_year: year })
    .eq('organization_id', orgId);
  if (error) return { error: error.message };

  return { number };
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
