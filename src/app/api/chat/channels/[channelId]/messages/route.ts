import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { listChannelMessages } from '@/features/messenger/queries';

/** Returns a channel's messages (agency only). Polled by the messenger UI. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  const messages = await listChannelMessages(channelId, user.id);
  return NextResponse.json({ messages });
}
