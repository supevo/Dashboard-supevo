import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBillingSettings } from '@/features/billing/queries';
import {
  effectiveMonthlyCents,
  readRedeemedIds,
  SUPEVO_SMART_LABEL,
} from '@/features/billing/membership';
import { promoDiscountCents, type PromoDiscount } from '@/features/promotions/discount';

export interface MembershipListRow {
  clientCompanyId: string;
  clientName: string;
  isLegacy: boolean;
  packageLabel: string;
  /** 'sepa' | 'transfer' */
  paymentMethod: string;
  /** SEPA gewählt, aber weder Mandatsreferenz noch IBAN hinterlegt. */
  sepaMandateMissing: boolean;
  /** 'active' | 'paused' | 'canceled' */
  status: string;
  startDate: string | null;
  /** Abrechnungsrhythmus in Monaten (1 = monatlich, 3, 12). */
  intervalMonths: number;
  /** Vertragliche Mindestlaufzeit in Monaten (null = ohne feste Laufzeit). */
  termMonths: number | null;
  /** Verlängert sich der Vertrag nach Ablauf automatisch. */
  autoRenew: boolean;
  /** Kündigungsfrist in Monaten (null = keine feste Frist). */
  noticePeriodMonths: number | null;
  /** Aktuelles Laufzeitende (bei Auto-Verlängerung fortgeschrieben). */
  contractEndIso: string | null;
  /** Spätester Kündigungstermin = Laufzeitende − Kündigungsfrist. */
  cancelDeadlineIso: string | null;
  /** Zahlung für den betrachteten Monat als abgebucht markiert. */
  collected: boolean;
  /** Ansprechpartner:in (Primär-Kontakt) – Name und E-Mail, soweit vorhanden. */
  contactName: string | null;
  contactEmail: string | null;
  /** Netto-Monatspreis nach Gutscheinen (Cent). */
  netCents: number;
  /** Monatspreis inkl. USt (Cent). */
  grossCents: number;
  /** Zugeordneter Rechnungssteller (Firma) – null = Standard. */
  billingEntityId: string | null;
  billingEntityName: string;
}

/** Startdatum + n Monate als ISO (YYYY-MM-DD), robust bei Monatsenden. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const base = new Date(Date.UTC(y, m - 1, d));
  const target = new Date(base);
  target.setUTCMonth(target.getUTCMonth() + months);
  // Bei Überlauf (z. B. 31.01. + 1 Monat) auf den letzten Tag des Zielmonats.
  if (target.getUTCDate() !== base.getUTCDate()) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/**
 * Laufzeitende + spätester Kündigungstermin. Bei Auto-Verlängerung wird das
 * Ende über heute hinaus fortgeschrieben (nächste Verlängerungsperiode).
 */
export function contractDates(
  startDate: string | null,
  termMonths: number | null,
  autoRenew: boolean,
  noticeMonths: number | null,
  todayIso: string,
): { end: string | null; cancelDeadline: string | null } {
  if (!startDate || !termMonths || termMonths <= 0) {
    return { end: null, cancelDeadline: null };
  }
  let end = addMonths(startDate, termMonths);
  if (autoRenew) {
    // Bis zur laufenden Periode fortschreiben (Deckel gegen Endlosschleifen).
    let guard = 0;
    while (end < todayIso && guard < 600) {
      end = addMonths(end, termMonths);
      guard += 1;
    }
  }
  const cancelDeadline = noticeMonths && noticeMonths > 0 ? addMonths(end, -noticeMonths) : end;
  return { end, cancelDeadline };
}

/**
 * Alle Kundenmitgliedschaften der Org als flache Liste für die
 * Mitgliedschafts-Übersicht: Paket, Zahlweg, Preis (netto + brutto), Start,
 * Laufzeit/Vertragsende, Ansprechpartner:in und Status. RLS beschränkt auf die
 * eigene Org.
 */
export async function listMembershipsForOverview(
  orgId: string,
  period: string,
  todayIso: string,
): Promise<MembershipListRow[]> {
  const supabase = await createSupabaseServerClient();
  const settings = await getBillingSettings(orgId);

  const { data: memberships } = await supabase
    .from('client_memberships')
    .select(
      'client_company_id, stage, custom_name, custom_net_cents, redeemed_promotions, payment_method, mandate_reference, debtor_iban, status, start_date, interval_months, term_months, auto_renew, notice_period_months',
    )
    .eq('organization_id', orgId);
  if (!memberships || memberships.length === 0) return [];

  // Für den betrachteten Monat abgehakte Zahlungseingänge.
  const { data: marks } = await supabase
    .from('membership_payment_marks')
    .select('client_company_id')
    .eq('organization_id', orgId)
    .eq('period', period);
  const collectedSet = new Set((marks ?? []).map((m) => m.client_company_id));

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
    .select('id, name, is_legacy, contact_email, billing_entity_id')
    .in('id', clientIds)
    .is('deleted_at', null);
  const companyById = new Map(
    (companies ?? []).map((c) => [c.id, c] as const),
  );

  // Rechnungssteller (Firma) je Kunde – für die Aufteilung nach Einzelunternehmen
  // vs. GmbH in der Überschlagsrechnung. Kunden ohne Zuordnung nutzen den Standard.
  const { data: entities } = await supabase
    .from('billing_entities')
    .select('id, name, company_name, is_default')
    .eq('organization_id', orgId);
  const entityNameById = new Map(
    (entities ?? []).map(
      (e) => [e.id, e.company_name || e.name || 'Rechnungssteller'] as const,
    ),
  );
  const defaultEntityId = (entities ?? []).find((e) => e.is_default)?.id ?? null;

  // Primär-Ansprechpartner:innen je Kunde (Kontakt = verknüpftes Nutzerkonto).
  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('client_company_id, user_id, is_primary')
    .eq('organization_id', orgId)
    .in('client_company_id', clientIds);
  const contactUserIds = [...new Set((contacts ?? []).map((c) => c.user_id))];
  const { data: profiles } = contactUserIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', contactUserIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));
  // Primärkontakt gewinnt, sonst der erste vorhandene Kontakt.
  const contactByClient = new Map<
    string,
    { name: string | null; email: string | null }
  >();
  for (const c of contacts ?? []) {
    const prof = profileById.get(c.user_id);
    const entry = { name: prof?.full_name ?? null, email: prof?.email ?? null };
    if (c.is_primary || !contactByClient.has(c.client_company_id)) {
      contactByClient.set(c.client_company_id, entry);
    }
  }

  const taxRate = settings?.small_business ? 0 : settings?.default_tax_rate ?? 19;
  const stage1Name = settings?.stage1_name ?? 'supevo Mitgliedschaft Stage 1';
  const stage2Name = settings?.stage2_name ?? 'supevo Mitgliedschaft Stage 2';

  const rows: MembershipListRow[] = memberships
    .filter((m) => companyById.has(m.client_company_id))
    .map((m) => {
      const company = companyById.get(m.client_company_id)!;
      const isLegacy = company.is_legacy ?? false;
      const base = effectiveMonthlyCents(
        { stage: m.stage, custom_net_cents: m.custom_net_cents },
        settings,
      );
      const redeemed = readRedeemedIds(m);
      const net = Math.max(0, base - promoDiscountCents(base, promoRules, redeemed));
      const gross = Math.round((net * (100 + taxRate)) / 100);
      const stageName = m.stage === 2 ? stage2Name : stage1Name;
      const packageLabel = isLegacy
        ? SUPEVO_SMART_LABEL
        : m.custom_name && m.custom_name !== 'Individuell'
          ? m.custom_name
          : stageName;
      const contact = contactByClient.get(m.client_company_id);
      const entityId =
        (company as { billing_entity_id?: string | null }).billing_entity_id ?? defaultEntityId;
      const term = m.term_months ?? null;
      const autoRenew = m.auto_renew ?? false;
      const notice = m.notice_period_months ?? null;
      const { end, cancelDeadline } = contractDates(
        m.start_date ?? null,
        term,
        autoRenew,
        notice,
        todayIso,
      );
      return {
        clientCompanyId: m.client_company_id,
        clientName: company.name,
        isLegacy,
        packageLabel,
        paymentMethod: m.payment_method ?? 'sepa',
        sepaMandateMissing:
          (m.payment_method ?? 'sepa') === 'sepa' &&
          !m.mandate_reference &&
          !m.debtor_iban,
        status: m.status,
        startDate: m.start_date ?? null,
        intervalMonths: m.interval_months ?? 1,
        termMonths: term,
        autoRenew,
        noticePeriodMonths: notice,
        contractEndIso: end,
        cancelDeadlineIso: cancelDeadline,
        collected: collectedSet.has(m.client_company_id),
        contactName: contact?.name ?? null,
        contactEmail: contact?.email ?? company.contact_email ?? null,
        netCents: net,
        grossCents: gross,
        billingEntityId: entityId,
        billingEntityName: entityId
          ? entityNameById.get(entityId) ?? 'Rechnungssteller'
          : 'Standard',
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'de'));

  return rows;
}
