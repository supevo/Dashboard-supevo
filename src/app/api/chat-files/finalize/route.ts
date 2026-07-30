import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { validateUpload, sanitizeFileName } from '@/lib/files/validation';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

const FILE_TTL_DAYS = 60;

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/** Step 3: records the chat message that carries the uploaded file. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  if (!hasAgencyAccess(user)) return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    channelId?: string;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  const channelId = body?.channelId ?? '';
  const storagePath = body?.storagePath ?? '';
  const fileName = sanitizeFileName(body?.fileName ?? '');
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  if (!channelId || !storagePath || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (validateUpload({ size: sizeBytes, type: mimeType })) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });

  // The object must live under this channel's folder.
  if (!storagePath.startsWith(`org/${channel.organization_id}/chat/${channelId}/`)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + FILE_TTL_DAYS * 86_400_000).toISOString();
  const service = createSupabaseServiceClient();
  const { data: msg, error } = await service
    .from('chat_channel_messages')
    .insert({
      channel_id: channelId,
      organization_id: channel.organization_id,
      author_id: user.id,
      body: null,
      file_path: storagePath,
      file_name: fileName,
      file_mime: mimeType,
      file_size: sizeBytes,
      file_expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error || !msg) {
    try {
      await service.storage.from(FILES_BUCKET).remove([storagePath]);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messageId: msg.id });
}
