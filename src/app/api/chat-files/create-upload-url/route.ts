import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSignedUploadTarget } from '@/lib/files/storage';
import { validateUpload, sanitizeFileName } from '@/lib/files/validation';
import { rateLimit } from '@/lib/rate-limit';
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

/** Step 1 of the chat file upload: agency-only, returns a signed upload target. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  if (!hasAgencyAccess(user)) return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });

  const limit = rateLimit(`chat-file:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    channelId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  const channelId = body?.channelId ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  if (!channelId || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  const invalid = validateUpload({ size: sizeBytes, type: mimeType });
  if (invalid) {
    return NextResponse.json(
      { error: invalid === 'TOO_LARGE' ? 'Die Datei ist zu groß (max. 25 MB).' : de.errors.VALIDATION },
      { status: 400 },
    );
  }

  // The channel must belong to an org the user is a member of (RLS read).
  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });

  const storagePath = `org/${channel.organization_id}/chat/${channelId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  const target = await createSignedUploadTarget(supabase, storagePath);
  if (!target) return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });

  return NextResponse.json({ path: target.path, token: target.token, storagePath });
}
