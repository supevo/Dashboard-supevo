import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { listChannelMessages, listChannelReads } from '@/features/messenger/queries';

/** Returns a channel's messages (agency only). Polled by the messenger UI.
 *  `?limit=N` lädt die neuesten N Nachrichten (Standard 20, „Mehr laden" erhöht
 *  das). So werden nicht jedes Mal Hunderte Nachrichten übertragen (Egress). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  const raw = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, Math.trunc(raw))) : 20;

  const [messages, reads] = await Promise.all([
    listChannelMessages(channelId, user.id, limit),
    listChannelReads(channelId, user.id),
  ]);
  // hasMore: es könnten noch ältere existieren, wenn das Fenster voll ist.
  return NextResponse.json({ messages, reads, hasMore: messages.length >= limit });
}
