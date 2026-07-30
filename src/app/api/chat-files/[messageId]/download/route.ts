import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/** Streams a chat file (agency staff of the file's org). Images render inline. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const service = createSupabaseServiceClient();
  const { data: msg } = await service
    .from('chat_channel_messages')
    .select('organization_id, file_path, file_name, file_mime')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || !msg.file_path) return new NextResponse(null, { status: 404 });

  const inOrg = user.memberships.some((m) => m.organizationId === msg.organization_id);
  if (!inOrg) return new NextResponse(null, { status: 403 });

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage.from(FILES_BUCKET).download(msg.file_path);
    blob = data;
  } catch (e) {
    logger.warn('chat_file.download_failed', { error: (e as Error).message });
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = msg.file_mime ?? 'application/octet-stream';
  const inline = mime.startsWith('image/') || mime === 'application/pdf';
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(msg.file_name ?? 'datei')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
