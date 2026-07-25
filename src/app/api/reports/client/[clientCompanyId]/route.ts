import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { gatherClientMonth } from '@/features/reports/report-data';
import { renderClientReportPdf } from '@/features/reports/client-report-pdf';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Streams a client's monthly report PDF (agency only). ?month=YYYY-MM */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientCompanyId: string }> },
) {
  const { clientCompanyId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  // RLS gate: the user must be able to see this client company.
  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('client_companies')
    .select('id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return new NextResponse(null, { status: 404 });

  const monthParam = request.nextUrl.searchParams.get('month') ?? '';
  const match = monthParam.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) : now.getUTCMonth() + 1;
  if (month < 1 || month > 12) return new NextResponse(null, { status: 400 });

  try {
    const report = await gatherClientMonth(clientCompanyId, year, month);
    const bytes = await renderClientReportPdf(report);
    const filename = `Monatsreport-${monthParam || `${year}-${String(month).padStart(2, '0')}`}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    logger.error('report.client.error', { error: (e as Error).message });
    return new NextResponse(null, { status: 500 });
  }
}
