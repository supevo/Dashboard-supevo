import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, hasAgencyAccess } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

/**
 * Secure asset download. Agency staff of the asset's org may fetch any asset;
 * a client contact of the company may fetch only guideline/logo assets (never
 * access references). Bytes are streamed via the service client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: asset } = await service
    .from('client_assets')
    .select('storage_path, organization_id, client_company_id, category, file_name, mime_type')
    .eq('id', assetId)
    .maybeSingle();

  if (!asset || !asset.storage_path) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  // Authorize: agency member of the org, or a client contact for a visible asset.
  let allowed = false;
  if (hasAgencyAccess(user)) {
    allowed = user.memberships.some(
      (m) => m.organizationId === asset.organization_id,
    );
  } else if (asset.category === 'guideline' || asset.category === 'logo') {
    const supabase = await createSupabaseServerClient();
    const { data: contact } = await supabase
      .from('client_contacts')
      .select('id')
      .eq('client_company_id', asset.client_company_id)
      .eq('user_id', user.id)
      .maybeSingle();
    allowed = Boolean(contact);
  }
  if (!allowed) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage
      .from(FILES_BUCKET)
      .download(asset.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('assets.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: asset.organization_id,
    action: 'file_download',
    entityType: 'client_asset',
    entityId: assetId,
  });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': asset.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(
        asset.file_name || 'asset',
      )}"`,
    },
  });
}
