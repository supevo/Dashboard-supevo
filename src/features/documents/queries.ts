import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { listPortalInvoices } from '@/features/billing/invoice-queries';

export interface DocLink {
  id: string;
  label: string;
  meta: string | null;
  url: string;
}

export interface ClientDocuments {
  contracts: DocLink[]; // signed contract + SEPA mandate
  invoices: DocLink[];
  assets: DocLink[]; // brand assets / uploaded files
}

const INVOICE_STATUS: Record<string, string> = {
  finalized: 'Offen',
  sent: 'Versendet',
  paid: 'Bezahlt',
  void: 'Storniert',
};

/**
 * Aggregates everything the client can download in one place: signed contract &
 * SEPA mandate, invoices (PDF) and brand assets/files. All reads are RLS-scoped
 * to the logged-in client; the download routes enforce access again.
 */
export async function getClientDocuments(): Promise<ClientDocuments> {
  const supabase = await createSupabaseServerClient();
  const company = await getMyClientCompany();

  const empty: ClientDocuments = { contracts: [], invoices: [], assets: [] };
  if (!company) return empty;

  const cid = company.clientCompanyId;

  const [{ data: ob }, invoices, { data: assets }] = await Promise.all([
    supabase
      .from('client_onboarding')
      .select('contract_pdf_path, sepa_pdf_path')
      .eq('client_company_id', cid)
      .maybeSingle(),
    listPortalInvoices(),
    supabase
      .from('client_assets')
      .select('id, file_name, category')
      .eq('client_company_id', cid)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const contracts: DocLink[] = [];
  if (ob?.contract_pdf_path) {
    contracts.push({
      id: 'contract',
      label: 'Dienstleistungsvertrag (unterschrieben)',
      meta: 'PDF',
      url: `/api/onboarding/contract?client=${cid}`,
    });
  }
  if (ob?.sepa_pdf_path) {
    contracts.push({
      id: 'sepa',
      label: 'SEPA-Lastschriftmandat',
      meta: 'PDF',
      url: `/api/onboarding/sepa?client=${cid}`,
    });
  }

  const invoiceLinks: DocLink[] = invoices.map((inv) => ({
    id: inv.id,
    label: inv.invoice_number ?? 'Rechnung',
    meta: INVOICE_STATUS[inv.status] ?? inv.status,
    url: `/api/invoices/${inv.id}/pdf`,
  }));

  const assetLinks: DocLink[] = (assets ?? []).map((a) => ({
    id: a.id,
    label: a.file_name || 'Datei',
    meta: a.category ?? null,
    url: `/api/assets/${a.id}/download`,
  }));

  return { contracts, invoices: invoiceLinks, assets: assetLinks };
}
