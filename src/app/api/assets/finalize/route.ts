import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { resolveAssetAccess } from '@/features/assets/access';
import { validateUpload, sanitizeFileName } from '@/lib/files/validation';
import { FILES_BUCKET } from '@/lib/files/storage';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/** Step 3 of the asset upload: records the client_assets row after the upload. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    clientCompanyId?: string;
    brandId?: string | null;
    category?: string;
    title?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;

  const clientCompanyId = body?.clientCompanyId ?? '';
  const brandId = body?.brandId || null;
  const category = body?.category ?? '';
  const storagePath = body?.storagePath ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  const title = (body?.title ?? '').trim() || sanitizeFileName(fileName);

  if (
    !clientCompanyId ||
    !storagePath ||
    !fileName ||
    !mimeType ||
    (category !== 'guideline' && category !== 'logo')
  ) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  if (validateUpload({ size: sizeBytes, type: mimeType })) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  // Agency staff of the company's org OR a client contact may finalize.
  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  // The object must live under this company's tenant folder.
  const expectedPrefix = `org/${access.orgId}/company/${clientCompanyId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const service = createSupabaseServiceClient();

  // A supplied brand must belong to this company.
  let safeBrandId: string | null = null;
  if (brandId) {
    const { data: brand } = await service
      .from('client_brands')
      .select('id')
      .eq('id', brandId)
      .eq('client_company_id', clientCompanyId)
      .maybeSingle();
    if (!brand) {
      return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
    }
    safeBrandId = brand.id;
  }

  const { data: row, error } = await service
    .from('client_assets')
    .insert({
      organization_id: access.orgId,
      client_company_id: clientCompanyId,
      brand_id: safeBrandId,
      category,
      title: title.slice(0, 200),
      storage_path: storagePath,
      file_name: sanitizeFileName(fileName),
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !row) {
    // Roll back the uploaded object if the metadata insert was rejected.
    try {
      await service.storage.from(FILES_BUCKET).remove([storagePath]);
    } catch {
      // Best-effort cleanup.
    }
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: access.orgId,
    action: 'file_upload',
    entityType: 'client_asset',
    entityId: row.id,
    metadata: { category, mime: mimeType, size: sizeBytes },
  });

  return NextResponse.json({ ok: true, assetId: row.id });
}
