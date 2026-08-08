import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { validateUpload } from '@/lib/files/validation';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
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

/** Step 3: records the uploaded page attachment's metadata row. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    pageId?: string;
    clientCompanyId?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;

  const pageId = body?.pageId ?? '';
  const storagePath = body?.storagePath ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!pageId || !storagePath || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (validateUpload({ size: sizeBytes, type: mimeType })) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: page } = await supabase
    .from('client_pages')
    .select('organization_id, client_company_id')
    .eq('id', pageId)
    .maybeSingle();
  if (!page) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }
  const { organization_id: orgId, client_company_id: clientCompanyId } =
    page as { organization_id: string; client_company_id: string };

  // The client must not smuggle a storage_path pointing outside this page.
  if (!storagePath.startsWith(`client-pages/${orgId}/${pageId}/`)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('client_page_attachments')
    .insert({
      organization_id: orgId,
      client_company_id: clientCompanyId,
      page_id: pageId,
      file_name: fileName.slice(0, 200),
      mime_type: mimeType,
      size_bytes: sizeBytes,
      storage_path: storagePath,
      created_by: user.id,
    } as never)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return NextResponse.json({ ok: true, id: (data as { id: string } | null)?.id });
}
