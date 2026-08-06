import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import {
  listChannels,
  listClientChannels,
  listDmConversations,
  listTeamMembers,
  getUnreadCounts,
} from '@/features/messenger/queries';

/** Channels, DMs, team members + unread counts for the docked chat widget. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) {
    return NextResponse.json({ channels: [], dms: [], members: [], unread: {} });
  }

  const [channels, clientChannels, dms, members, unread] = await Promise.all([
    listChannels(orgId),
    listClientChannels(orgId),
    listDmConversations(orgId, user.id),
    listTeamMembers(orgId, user.id),
    getUnreadCounts(),
  ]);
  return NextResponse.json({ channels, clientChannels, dms, members, unread });
}
