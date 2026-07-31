import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { resolveAssetAccess } from '@/features/assets/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/** Streams a signed onboarding PDF (contract / sepa) for authorized viewers. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docType: string }> },
) {
  const { docType } = await params;
  if (
    docType !== 'contract' &&
    docType !== 'sepa' &&
    docType !== 'contract-template' &&
    docType !== 'sepa-preview'
  ) {
    return new NextResponse(null, { status: 404 });
  }
  const clientCompanyId = request.nextUrl.searchParams.get('client') ?? '';
  if (!clientCompanyId) return new NextResponse(null, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  // Agency staff of the org OR a client contact of this company may view.
  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) return new NextResponse(null, { status: 403 });

  const service = createSupabaseServiceClient();
  const { data: ob } = await service
    .from('client_onboarding')
    .select('contract_pdf_path, sepa_pdf_path, contract_template_path, sepa_preview_path')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  const path =
    docType === 'contract'
      ? ob?.contract_pdf_path
      : docType === 'sepa'
        ? ob?.sepa_pdf_path
        : docType === 'contract-template'
          ? ob?.contract_template_path
          : ob?.sepa_preview_path;
  if (!path) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage.from(FILES_BUCKET).download(path);
    blob = data;
  } catch (e) {
    logger.warn('onboarding.pdf.download_failed', { error: (e as Error).message });
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${docType}.pdf"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
