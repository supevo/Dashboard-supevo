import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { generatePain008, type SepaDebit } from '@/features/billing/sepa';

/**
 * Generates a SEPA Core direct-debit file (pain.008) for all open SEPA
 * invoices of the caller's organization and returns it as a download.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return new NextResponse('Kein Agenturzugang.', { status: 403 });

  const supabase = await createSupabaseServerClient();

  const { data: settings } = await supabase
    .from('billing_settings')
    .select('company_name, iban, bic, creditor_id')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!settings?.company_name || !settings.iban || !settings.creditor_id) {
    return new NextResponse(
      'Bitte zuerst Firmenname, IBAN und Gläubiger-ID unter „Firma & Rechnung" hinterlegen.',
      { status: 400 },
    );
  }

  // Open SEPA invoices (finalized/sent, not paid).
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, gross_cents, membership_id, status, paid_at, payment_method')
    .eq('organization_id', orgId)
    .eq('payment_method', 'sepa')
    .in('status', ['finalized', 'sent'])
    .is('paid_at', null);

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
      name: settings.company_name,
      iban: settings.iban,
      bic: settings.bic,
      creditorId: settings.creditor_id,
    },
    debits,
    requestedCollectionDate: collDate.toISOString().slice(0, 10),
  });

  const filename = `SEPA-Lastschrift-${new Date().toISOString().slice(0, 10)}.xml`;
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
