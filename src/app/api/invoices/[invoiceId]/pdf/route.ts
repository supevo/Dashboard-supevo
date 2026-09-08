import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { resolveInvoiceEntity } from '@/features/billing/invoice-service';
import { renderInvoicePdf } from '@/features/billing/invoice-pdf';
import { getClientMembership } from '@/features/billing/membership';
import { getOrgBranding } from '@/features/branding/queries';
import type { InvoiceRow } from '@/features/billing/invoice-queries';
import { logger } from '@/lib/logger';

/**
 * Rendert eine Entwurfs-Rechnung als PDF-Vorschau (nicht gespeichert), damit man
 * sie VOR dem Finalisieren ansehen und bewerten kann. Ohne Nummer/Datum, mit
 * „ENTWURF"-Kennzeichnung. RLS gibt den Entwurf nur Agentur-Mitarbeitern frei.
 */
async function draftPreview(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoice: InvoiceRow,
): Promise<NextResponse> {
  const entity = await resolveInvoiceEntity(supabase, invoice);
  if (!entity) {
    return NextResponse.json(
      { error: 'Kein Rechnungssteller hinterlegt – Vorschau nicht möglich.' },
      { status: 409 },
    );
  }
  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('position', { ascending: true });
  const membership = await getClientMembership(invoice.client_company_id);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const bytes = await renderInvoicePdf({
      // Für die Vorschau als „ENTWURF" kennzeichnen; nichts wird gespeichert.
      invoice: {
        ...invoice,
        invoice_number: 'ENTWURF – Vorschau',
        issue_date: invoice.issue_date ?? today,
        due_date: invoice.due_date ?? today,
      },
      items: items ?? [],
      settings: entity,
      membership,
      logoDark: (await getOrgBranding(invoice.organization_id)).logoDark,
    });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Entwurf-${invoice.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('invoice.preview.failed', { error: (e as Error).message });
    return NextResponse.json(
      { error: 'Vorschau konnte nicht erzeugt werden.' },
      { status: 500 },
    );
  }
}

/**
 * Streams a finalized invoice PDF – or, for a draft, renders an on-the-fly
 * preview. The invoices-table RLS is the access gate (agency org staff, or the
 * client for their own non-draft invoices).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return new NextResponse(null, { status: 404 });

  // Entwurf (noch kein gespeichertes PDF) → Live-Vorschau rendern.
  if (!invoice.pdf_path) {
    return draftPreview(supabase, invoice as unknown as InvoiceRow);
  }

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(invoice.pdf_path);
    blob = data;
  } catch (e) {
    logger.warn('invoice.pdf.service_unavailable', { error: (e as Error).message });
  }
  if (!blob) {
    const { data } = await supabase.storage
      .from(FILES_BUCKET)
      .download(invoice.pdf_path);
    blob = data;
  }
  if (!blob) return new NextResponse(null, { status: 500 });

  const download = request.nextUrl.searchParams.get('dl') === '1';
  const filename = `Rechnung-${invoice.invoice_number ?? invoiceId}.pdf`;
  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
