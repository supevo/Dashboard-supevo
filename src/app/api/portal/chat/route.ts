import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasClientAccess } from '@/features/auth/access';
import { getMyClientChannelThread } from '@/features/messenger/client-chat';

/** The logged-in client's chat thread (with their account managers). Polled by
 *  the floating client chat dock. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasClientAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const thread = await getMyClientChannelThread(user.id);
  if (!thread) return NextResponse.json({ channelId: null, messages: [] });
  return NextResponse.json(thread);
}
