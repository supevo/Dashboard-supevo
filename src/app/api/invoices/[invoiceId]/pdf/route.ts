import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/**
 * Streams a finalized invoice PDF. The invoices-table RLS is the access gate
 * (agency org staff, or the client for their own non-draft invoices).
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
    .select('pdf_path, invoice_number')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice?.pdf_path) return new NextResponse(null, { status: 404 });

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
