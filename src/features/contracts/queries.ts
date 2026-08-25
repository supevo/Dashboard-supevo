import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getModuleCatalog } from '@/features/memberships/catalog-queries';
import {
  moduleMonthlyCents,
  normalizeSelections,
  groupByCategory,
  type ModuleDef,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';
import { getActivePromotions } from '@/features/promotions/queries';
import { promoDiscountCents } from '@/features/promotions/discount';
import { resolveClientEntity, type BillingEntity } from '@/features/billing/invoice-service';
import { DEFAULT_CONTRACT_TERMS } from '@/features/contracts/terms';
import { getOrgBranding } from '@/features/branding/queries';

export interface ContractLine {
  label: string;
  detail: string | null;
  monthlyCents: number;
}
export interface ContractData {
  provider: {
    name: string;
    addressLines: string[];
    vatId: string | null;
    taxNumber: string | null;
    email: string | null;
    phone: string | null;
    iban: string | null;
    bic: string | null;
    bankName: string | null;
  };
  customer: {
    name: string;
    contactName: string | null;
    email: string | null;
    addressLines: string[];
    vatId: string | null;
  };
  lines: ContractLine[];
  budgetCents: number;
  discountCents: number;
  monthlyNetCents: number;
  taxRatePct: number;
  smallBusiness: boolean;
  terms: string;
  date: string;
  reference: string;
  /** Dunkles Org-Logo (data-URI) für den hellen Vertragskopf, oder null. */
  logoDark: string | null;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function getTerms(orgId: string): Promise<string> {
  // Service-Client: der Konditionstext ist nicht sensibel und soll für jeden
  // Agentur-Nutzer im Vertrag sichtbar sein (Schreiben bleibt admin-only via RLS).
  const { data } = await createSupabaseServiceClient()
    .from('contract_settings')
    .select('terms')
    .eq('organization_id', orgId)
    .maybeSingle();
  const t = data?.terms?.trim();
  return t && t.length > 0 ? t : DEFAULT_CONTRACT_TERMS;
}

async function orgDefaultEntity(orgId: string): Promise<BillingEntity | null> {
  const { data } = await createSupabaseServiceClient()
    .from('billing_entities')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_default', true)
    .maybeSingle();
  return (data as BillingEntity | null) ?? null;
}

async function priceContextFor(supabase: Supabase, orgId: string): Promise<PriceContext> {
  const { data } = await createSupabaseServiceClient()
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', orgId)
    .maybeSingle();
  return {
    stage1NetCents: data?.stage1_net_cents ?? 0,
    stage2NetCents: data?.stage2_net_cents ?? 0,
  };
}

function providerFrom(entity: BillingEntity | null): ContractData['provider'] {
  const addressLines: string[] = [];
  if (entity?.address_line1) addressLines.push(entity.address_line1);
  if (entity?.address_line2) addressLines.push(entity.address_line2);
  const cityLine = [entity?.postal_code, entity?.city].filter(Boolean).join(' ');
  if (cityLine) addressLines.push(cityLine);
  if (entity?.country && entity.country !== 'DE') addressLines.push(entity.country);
  return {
    name: entity?.company_name || entity?.name || 'Auftragnehmer',
    addressLines,
    vatId: entity?.vat_id ?? null,
    taxNumber: entity?.tax_number ?? null,
    email: entity?.contact_email ?? null,
    phone: entity?.phone ?? null,
    iban: entity?.iban ?? null,
    bic: entity?.bic ?? null,
    bankName: entity?.bank_name ?? null,
  };
}

function buildLines(
  catalog: ModuleDef[],
  selections: ModuleSelection[],
  ctx: PriceContext,
): { lines: ContractLine[]; budgetCents: number } {
  const byKey = new Map(catalog.map((d) => [d.key, d]));
  const lines: ContractLine[] = [];
  let budgetCents = 0;
  // Reihenfolge EXAKT wie im Baukasten: zuerst die Stufen (Komplettbetreuung) in
  // Katalog-Reihenfolge, danach die restlichen Module nach Kategorie gruppiert
  // (categoryPosition → Kategorie → position) – identisch zu groupByCategory im
  // Konfigurator, damit Vertrag und Auswahl gleich sortiert sind.
  const stageDefs = catalog.filter((d) => d.pricing.kind === 'stage');
  const restOrdered = groupByCategory(
    catalog.filter((d) => d.pricing.kind !== 'stage'),
  ).flatMap((g) => g.modules);
  const orderIndex = new Map(
    [...stageDefs, ...restOrdered].map((d, i) => [d.key, i] as const),
  );
  const active = selections
    .filter((s) => s.enabled)
    .map((s) => ({ s, def: byKey.get(s.id) }))
    .filter((x): x is { s: typeof x.s; def: ModuleDef } => !!x.def)
    .sort(
      (a, b) =>
        (orderIndex.get(a.def.key) ?? 0) - (orderIndex.get(b.def.key) ?? 0),
    );
  for (const { s, def } of active) {
    const detail: string[] = [];
    // Menge nur zeigen, wenn wirklich mehrere Einheiten gemeint sind. Ohne
    // Einheiten-Label nur die reine Anzahl (kein „monatlich" o. Ä.).
    if (def.pricing.kind === 'per_unit' && s.qty && s.qty > 1) {
      detail.push(
        def.pricing.unitLabel
          ? `${s.qty} ${def.pricing.unitLabel}`
          : `Anzahl: ${s.qty}`,
      );
    }
    if (def.keywordCents > 0) {
      detail.push(`${s.keywords ?? def.keywordDefault} Keywords`);
    }
    if (def.captureBudget && s.budgetCents) {
      budgetCents += s.budgetCents;
      detail.push(`Werbebudget ${Math.round(s.budgetCents / 100)} €/Monat separat`);
    }
    lines.push({
      label: def.label,
      detail: detail.length ? detail.join(' · ') : def.description || null,
      monthlyCents: moduleMonthlyCents(def, s, ctx),
    });
  }
  return { lines, budgetCents };
}

const todayDe = () => new Date().toLocaleDateString('de-DE');

/** Vertragsdaten aus einem Lead (vor Abschluss). */
export async function buildContractFromLead(leadId: string): Promise<ContractData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select(
      'id, organization_id, contact_name, company, email, modules, redeemed_promotions, offer_name, billing_address_line1, billing_address_line2, billing_postal_code, billing_city, billing_country',
    )
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return null;

  const orgId = lead.organization_id;
  const [ctx, catalog, terms, promotions, entity] = await Promise.all([
    priceContextFor(supabase, orgId),
    getModuleCatalog(orgId),
    getTerms(orgId),
    getActivePromotions(orgId),
    orgDefaultEntity(orgId),
  ]);

  const selections = normalizeSelections(lead.modules);
  const { lines, budgetCents } = buildLines(catalog, selections, ctx);
  const gross = lines.reduce((s, l) => s + l.monthlyCents, 0);
  const redeemed = Array.isArray(lead.redeemed_promotions)
    ? (lead.redeemed_promotions as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const discountCents = promoDiscountCents(gross, promotions, redeemed);

  const { data: s } = await createSupabaseServiceClient()
    .from('billing_settings')
    .select('default_tax_rate, small_business')
    .eq('organization_id', orgId)
    .maybeSingle();

  const leadAddress: string[] = [];
  if (lead.billing_address_line1) leadAddress.push(lead.billing_address_line1);
  if (lead.billing_address_line2) leadAddress.push(lead.billing_address_line2);
  const leadCityLine = [lead.billing_postal_code, lead.billing_city]
    .filter(Boolean)
    .join(' ');
  if (leadCityLine) leadAddress.push(leadCityLine);
  if (lead.billing_country && lead.billing_country !== 'DE') {
    leadAddress.push(lead.billing_country);
  }

  return {
    provider: providerFrom(entity),
    customer: {
      name: lead.company || lead.contact_name,
      contactName: lead.company ? lead.contact_name : null,
      email: lead.email,
      addressLines: leadAddress,
      vatId: null,
    },
    lines,
    budgetCents,
    discountCents,
    monthlyNetCents: Math.max(0, gross - discountCents),
    taxRatePct: s?.default_tax_rate ?? 19,
    smallBusiness: s?.small_business ?? false,
    terms,
    date: todayDe(),
    reference: lead.offer_name && lead.offer_name !== 'Individuell' ? lead.offer_name : '',
    logoDark: (await getOrgBranding(orgId)).logoDark,
  };
}

/** Vertragsdaten aus einem bestehenden Kunden (Mitgliedschaft). */
export async function buildContractFromClient(
  clientCompanyId: string,
): Promise<ContractData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from('client_memberships')
    .select(
      'organization_id, client_company_id, modules, custom_name, custom_net_cents, redeemed_promotions, billing_name, billing_vat_id, billing_address_line1, billing_address_line2, billing_postal_code, billing_city, billing_country',
    )
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!membership) return null;

  const orgId = membership.organization_id;
  const { data: company } = await supabase
    .from('client_companies')
    .select('name, contact_email')
    .eq('id', clientCompanyId)
    .maybeSingle();

  const [ctx, catalog, terms, entity] = await Promise.all([
    priceContextFor(supabase, orgId),
    getModuleCatalog(orgId),
    getTerms(orgId),
    resolveClientEntity(createSupabaseServiceClient(), orgId, clientCompanyId),
  ]);

  const selections = normalizeSelections(membership.modules);
  const built = buildLines(catalog, selections, ctx);
  const budgetCents = built.budgetCents;
  const grossFromModules = built.lines.reduce((s, l) => s + l.monthlyCents, 0);

  // Ein gesetzter Custom-Preis überschreibt den berechneten Modul-/Stufenpreis
  // (wie effectiveMonthlyCents und der Baukasten). Dann eine Zeile zum
  // Custom-Preis, damit Zeile und Summe übereinstimmen.
  const customNetCents =
    (membership as { custom_net_cents?: number | null }).custom_net_cents ?? null;
  // Label: den echten Stufennamen zeigen, NICHT „Individuell". Ein eigener
  // custom_name wird nur genutzt, wenn er kein Platzhalter ist.
  const customLabel =
    membership.custom_name && membership.custom_name !== 'Individuell'
      ? membership.custom_name
      : built.lines[0]?.label || 'supevo Mitgliedschaft';
  // Module immer einzeln auflisten (wie im Lead-Angebot), sobald welche gewählt
  // sind. Nur ganz ohne Modulzeilen (reiner manueller Preis) gibt es eine
  // einzelne Preiszeile.
  const itemize = built.lines.length > 0;
  const lines: ContractLine[] = itemize
    ? built.lines
    : [
        {
          label: customLabel,
          detail: null,
          monthlyCents: customNetCents ?? grossFromModules,
        },
      ];
  // Der abgerechnete Betrag gewinnt (Custom-Preis überschreibt die Modulsumme);
  // die Modulzeilen bleiben zur Transparenz erhalten.
  const gross = customNetCents ?? grossFromModules;

  // Eingelöste Gutscheine mindern den Vertragspreis (wie im Lead-Angebot und in
  // der laufenden Abrechnung). Bewusst ohne active-Filter – einmal eingelöst,
  // gilt der Rabatt weiter.
  const clientRedeemed = Array.isArray(membership.redeemed_promotions)
    ? (membership.redeemed_promotions as unknown[]).filter(
        (x): x is string => typeof x === 'string',
      )
    : [];
  let clientDiscountCents = 0;
  if (clientRedeemed.length > 0) {
    const { data: promoRows } = await createSupabaseServiceClient()
      .from('promotions')
      .select('id, discount_kind, discount_value')
      .eq('organization_id', orgId)
      .in('id', clientRedeemed);
    const rules = (promoRows ?? []).map((p) => ({
      id: p.id,
      discountKind: (p.discount_kind ?? 'none') as
        | 'none'
        | 'fixed'
        | 'percent',
      discountValue: p.discount_value ?? 0,
    }));
    clientDiscountCents = promoDiscountCents(gross, rules, clientRedeemed);
  }

  const { data: s } = await createSupabaseServiceClient()
    .from('billing_settings')
    .select('default_tax_rate, small_business')
    .eq('organization_id', orgId)
    .maybeSingle();

  // Rechnungsadresse des Kunden aus der Mitgliedschaft (Schritt „Adresse & SEPA").
  const m = membership as {
    billing_name?: string | null;
    billing_vat_id?: string | null;
    billing_address_line1?: string | null;
    billing_address_line2?: string | null;
    billing_postal_code?: string | null;
    billing_city?: string | null;
    billing_country?: string | null;
  };
  const customerAddress: string[] = [];
  if (m.billing_address_line1) customerAddress.push(m.billing_address_line1);
  if (m.billing_address_line2) customerAddress.push(m.billing_address_line2);
  const custCityLine = [m.billing_postal_code, m.billing_city]
    .filter(Boolean)
    .join(' ');
  if (custCityLine) customerAddress.push(custCityLine);
  if (m.billing_country && !['deutschland', 'de'].includes(m.billing_country.toLowerCase())) {
    customerAddress.push(m.billing_country);
  }

  return {
    provider: providerFrom(entity),
    customer: {
      name: m.billing_name || company?.name || 'Kunde',
      contactName: null,
      email: company?.contact_email ?? null,
      addressLines: customerAddress,
      vatId: m.billing_vat_id ?? null,
    },
    lines,
    budgetCents,
    discountCents: clientDiscountCents,
    monthlyNetCents: Math.max(0, gross - clientDiscountCents),
    taxRatePct: s?.default_tax_rate ?? 19,
    smallBusiness: s?.small_business ?? false,
    terms,
    date: todayDe(),
    reference: membership.custom_name && membership.custom_name !== 'Individuell'
      ? membership.custom_name
      : '',
    logoDark: (await getOrgBranding(orgId)).logoDark,
  };
}

/** Aktuellen Konditionstext einer Org fürs Backend-Formular. */
export async function getContractTerms(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('contract_settings')
    .select('terms')
    .eq('organization_id', orgId)
    .maybeSingle();
  const t = data?.terms?.trim();
  return t && t.length > 0 ? t : DEFAULT_CONTRACT_TERMS;
}
