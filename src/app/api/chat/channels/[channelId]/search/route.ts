import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { searchChannelMessages } from '@/features/messenger/queries';

/** Searches a channel's messages (text + file names). Agency only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const messages = await searchChannelMessages(channelId, user.id, q);
  return NextResponse.json({ messages });
}
