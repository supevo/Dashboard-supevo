import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { logActivity } from '@/lib/audit';
import {
  validateUpload,
  buildStoragePath,
  sanitizeFileName,
} from '@/lib/files/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

const BUCKET = 'files';

/** Rejects cross-site POSTs by comparing the Origin header to the app URL. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser / same-origin navigations omit it.
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  EMPTY: 'Die Datei ist leer.',
  TOO_LARGE: 'Die Datei überschreitet die maximale Größe (25 MB).',
  MIME_NOT_ALLOWED: 'Dieser Dateityp ist nicht erlaubt.',
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  // Basic per-user upload rate limit (30/minute).
  const limit = rateLimit(`upload:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  const projectId = String(form.get('projectId') ?? '');
  const taskId = form.get('taskId') ? String(form.get('taskId')) : null;
  const isInternal = String(form.get('isInternal') ?? 'true') === 'true';

  if (!(file instanceof File) || !projectId) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const validationError = validateUpload({ size: file.size, type: file.type });
  if (validationError) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[validationError] ?? de.errors.VALIDATION },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Verify project access (RLS) and derive the tenant.
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const storagePath = buildStoragePath({
    organizationId: project.organization_id,
    projectId,
    taskId,
    uuid: randomUUID(),
    fileName: file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  const { data: fileRow, error: insertError } = await supabase
    .from('files')
    .insert({
      organization_id: project.organization_id,
      project_id: projectId,
      task_id: taskId,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: sanitizeFileName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      checksum_sha256: checksum,
      is_internal: isInternal,
    })
    .select('id')
    .single();

  if (insertError || !fileRow) {
    // Roll back the stored object if metadata insert was rejected (e.g. RLS).
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: project.organization_id,
    action: 'file_upload',
    entityType: taskId ? 'task' : 'project',
    entityId: taskId ?? projectId,
    metadata: { fileId: fileRow.id, mime: file.type, size: file.size },
  });

  return NextResponse.json({ ok: true, fileId: fileRow.id });
}
