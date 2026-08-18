import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { generatePain008, type SepaDebit } from '@/features/billing/sepa';

/**
 * Generates a SEPA Core direct-debit file (pain.008) for the open SEPA invoices
 * of EXACTLY ONE billing entity (Rechnungssteller) and returns it as a download.
 *
 * Wichtig für Mehr-Firmen-Setups: Jede Firma zieht nur ihre eigenen Kunden mit
 * ihrer eigenen Gläubiger-ID/IBAN ein. Die Firma wird über ?entity=<id> gewählt;
 * ohne Angabe die Standard-Firma. Rechnungen ohne zugeordnete Firma laufen unter
 * der Standard-Firma mit (Altbestand/kein Rechnungssteller gesetzt).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return new NextResponse('Kein Agenturzugang.', { status: 403 });

  const supabase = await createSupabaseServerClient();

  // Gewählte Firma (Rechnungssteller) auflösen – explizit oder Standard.
  const entityParam = request.nextUrl.searchParams.get('entity');
  const entityQuery = supabase
    .from('billing_entities')
    .select('id, company_name, iban, bic, creditor_id, is_default')
    .eq('organization_id', orgId);
  const { data: entity } = entityParam
    ? await entityQuery.eq('id', entityParam).maybeSingle()
    : await entityQuery.eq('is_default', true).maybeSingle();

  if (!entity) {
    return new NextResponse('Rechnungssteller nicht gefunden.', { status: 404 });
  }
  if (!entity.company_name || !entity.iban || !entity.creditor_id) {
    return new NextResponse(
      `Bitte zuerst Firmenname, IBAN und Gläubiger-ID für „${entity.company_name ?? 'diesen Rechnungssteller'}" hinterlegen.`,
      { status: 400 },
    );
  }
  // Nach dem Guard gesicherte Werte festhalten (Narrowing übersteht das await nicht).
  const creditorName = entity.company_name;
  const creditorIban = entity.iban;
  const creditorIdValue = entity.creditor_id;
  const creditorBic = entity.bic;

  // Offene SEPA-Rechnungen (finalisiert/versendet, nicht bezahlt) NUR dieser
  // Firma. Die Standard-Firma zieht zusätzlich Rechnungen ohne zugeordnete Firma.
  let query = supabase
    .from('invoices')
    .select('id, invoice_number, gross_cents, membership_id, status, paid_at, payment_method, billing_entity_id')
    .eq('organization_id', orgId)
    .eq('payment_method', 'sepa')
    .in('status', ['finalized', 'sent'])
    .is('paid_at', null);
  query = entity.is_default
    ? query.or(`billing_entity_id.eq.${entity.id},billing_entity_id.is.null`)
    : query.eq('billing_entity_id', entity.id);
  const { data: invoices } = await query;

  const membershipIds = [
    ...new Set((invoices ?? []).map((i) => i.membership_id).filter(Boolean)),
  ] as string[];
  const membershipMap = new Map<
    string,
    {
      mandate_reference: string | null;
      mandate_date: string | null;
      debtor_iban: string | null;
      debtor_bic: string | null;
      billing_name: string | null;
    }
  >();
  if (membershipIds.length > 0) {
    const { data: memberships } = await supabase
      .from('client_memberships')
      .select('id, mandate_reference, mandate_date, debtor_iban, debtor_bic, billing_name')
      .in('id', membershipIds);
    for (const m of memberships ?? []) membershipMap.set(m.id, m);
  }

  const debits: SepaDebit[] = [];
  for (const inv of invoices ?? []) {
    const m = inv.membership_id ? membershipMap.get(inv.membership_id) : null;
    if (!m?.mandate_reference || !m.mandate_date || !m.debtor_iban || !m.billing_name) {
      continue; // skip invoices without a complete mandate
    }
    debits.push({
      endToEndId: inv.invoice_number ?? inv.id,
      amountCents: inv.gross_cents,
      debtorName: m.billing_name,
      debtorIban: m.debtor_iban,
      debtorBic: m.debtor_bic,
      mandateId: m.mandate_reference,
      mandateDate: m.mandate_date,
      remittanceInfo: `Rechnung ${inv.invoice_number ?? ''}`.trim(),
    });
  }

  if (debits.length === 0) {
    return new NextResponse(
      'Keine offenen SEPA-Lastschriften mit vollständigem Mandat gefunden.',
      { status: 404 },
    );
  }

  const collDate = new Date();
  collDate.setDate(collDate.getDate() + 3);
  const xml = generatePain008({
    creditor: {
      name: creditorName,
      iban: creditorIban,
      bic: creditorBic,
      creditorId: creditorIdValue,
    },
    debits,
    requestedCollectionDate: collDate.toISOString().slice(0, 10),
  });

  const slug = (entity.company_name ?? 'Firma')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const filename = `SEPA-${slug}-${new Date().toISOString().slice(0, 10)}.xml`;
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
