import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, hasAgencyAccess } from '@/features/auth/session';
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
  if (!hasAgencyAccess(user)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    clientCompanyId?: string;
    category?: string;
    title?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;

  const clientCompanyId = body?.clientCompanyId ?? '';
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

  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  // The object must live under this company's tenant folder.
  const expectedPrefix = `org/${company.organization_id}/company/${clientCompanyId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from('client_assets')
    .insert({
      organization_id: company.organization_id,
      client_company_id: clientCompanyId,
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
      await createSupabaseServiceClient()
        .storage.from(FILES_BUCKET)
        .remove([storagePath]);
    } catch {
      // Best-effort cleanup.
    }
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: company.organization_id,
    action: 'file_upload',
    entityType: 'client_asset',
    entityId: row.id,
    metadata: { category, mime: mimeType, size: sizeBytes },
  });

  return NextResponse.json({ ok: true, assetId: row.id });
}
