import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

/**
 * Streams a chat sticker image. The path is `org/<orgId>/chat-sticker/<id>`;
 * the caller must be an agency member of that org. Served via the service
 * client (the bucket is private).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get('path') ?? '';
  const match = /^org\/([0-9a-fA-F-]{36})\/chat-sticker\//.exec(path);
  if (!match) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  const orgId = match[1];
  if (!user.memberships.some((m) => m.organizationId === orgId)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(path);
    blob = data;
  } catch (e) {
    logger.warn('chat_sticker.download_failed', { error: (e as Error).message });
  }
  if (!blob) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
