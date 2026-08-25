import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBillingSettings } from '@/features/billing/queries';
import { effectiveMonthlyCents, readRedeemedIds } from '@/features/billing/membership';
import { promoDiscountCents, type PromoDiscount } from '@/features/promotions/discount';
import type { InvoiceRow } from '@/features/billing/invoice-queries';

export interface BillingOverviewRow {
  clientCompanyId: string;
  clientName: string;
  packageLabel: string;
  /** 'sepa' | 'transfer' */
  paymentMethod: string;
  /** SEPA gewählt, aber weder Mandatsreferenz noch IBAN hinterlegt. */
  sepaMandateMissing: boolean;
  /** Effektiver Monatspreis inkl. USt (Custom-Preis gewinnt). */
  grossCents: number;
  membershipStatus: string;
  /** SEPA-Mandat-Details (für „Mandat anzeigen"). */
  mandateReference: string | null;
  debtorIban: string | null;
  mandateDate: string | null;
  /** Rechnung, deren Leistungszeitraum im gewählten Monat startet (oder null). */
  invoice: InvoiceRow | null;
}

/** Erster/letzter Tag eines Monats als ISO (YYYY-MM-DD). */
function monthBounds(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Monats-Rechnungsübersicht je Kunde: Paket, Zahlweg, Preis inkl. USt und der
 * Status der Rechnung für den gewählten Monat (nicht generiert / Entwurf /
 * finalisiert / versendet / bezahlt / storniert). Zeigt alle Mitgliedschaften
 * (aktiv, pausiert, gekündigt); RLS beschränkt auf die Org.
 */
export async function getMonthlyBillingOverview(
  orgId: string,
  year: number,
  month: number,
): Promise<BillingOverviewRow[]> {
  const supabase = await createSupabaseServerClient();
  const settings = await getBillingSettings(orgId);

  const { data: memberships } = await supabase
    .from('client_memberships')
    .select(
      'client_company_id, stage, custom_name, custom_net_cents, redeemed_promotions, payment_method, mandate_reference, debtor_iban, mandate_date, status',
    )
    .eq('organization_id', orgId);
  if (!memberships || memberships.length === 0) return [];

  // Alle Gutscheine der Org einmalig laden (auch inaktive: ein eingelöster
  // Gutschein mindert die Abrechnung weiter). Rabatt später je Zeile im Speicher.
  const { data: promoRows } = await supabase
    .from('promotions')
    .select('id, discount_kind, discount_value')
    .eq('organization_id', orgId);
  const promoRules: PromoDiscount[] = (promoRows ?? []).map((p) => ({
    id: p.id,
    discountKind: (p.discount_kind ?? 'none') as PromoDiscount['discountKind'],
    discountValue: p.discount_value ?? 0,
  }));

  const clientIds = [...new Set(memberships.map((m) => m.client_company_id))];
  const { data: companies } = await supabase
    .from('client_companies')
    .select('id, name')
    .in('id', clientIds)
    .is('deleted_at', null);
  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  // Rechnungen, deren Leistungszeitraum im gewählten Monat beginnt.
  const { start, end } = monthBounds(year, month);
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('organization_id', orgId)
    .gte('service_period_start', start)
    .lte('service_period_start', end)
    .order('created_at', { ascending: false });
  // Je Kunde die jüngste Rechnung des Monats.
  const invoiceByClient = new Map<string, InvoiceRow>();
  for (const inv of (invoices ?? []) as InvoiceRow[]) {
    if (!invoiceByClient.has(inv.client_company_id)) {
      invoiceByClient.set(inv.client_company_id, inv);
    }
  }

  const taxRate = settings?.small_business ? 0 : settings?.default_tax_rate ?? 19;
  const stage1Name = settings?.stage1_name ?? 'supevo Mitgliedschaft Stage 1';
  const stage2Name = settings?.stage2_name ?? 'supevo Mitgliedschaft Stage 2';

  const rows: BillingOverviewRow[] = memberships
    .filter((m) => nameById.has(m.client_company_id))
    .map((m) => {
      const base = effectiveMonthlyCents(
        { stage: m.stage, custom_net_cents: m.custom_net_cents },
        settings,
      );
      const redeemed = readRedeemedIds(m);
      const net = Math.max(0, base - promoDiscountCents(base, promoRules, redeemed));
      const gross = Math.round((net * (100 + taxRate)) / 100);
      // Kein „Individuell" – immer der echte Stufenname.
      const stageName = m.stage === 2 ? stage2Name : stage1Name;
      const packageLabel =
        m.custom_name && m.custom_name !== 'Individuell' ? m.custom_name : stageName;
      return {
        clientCompanyId: m.client_company_id,
        clientName: nameById.get(m.client_company_id) ?? '—',
        packageLabel,
        paymentMethod: m.payment_method ?? 'sepa',
        sepaMandateMissing:
          (m.payment_method ?? 'sepa') === 'sepa' &&
          !m.mandate_reference &&
          !m.debtor_iban,
        grossCents: gross,
        membershipStatus: m.status,
        mandateReference: m.mandate_reference ?? null,
        debtorIban: m.debtor_iban ?? null,
        mandateDate: m.mandate_date ?? null,
        invoice: invoiceByClient.get(m.client_company_id) ?? null,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'de'));

  return rows;
}
