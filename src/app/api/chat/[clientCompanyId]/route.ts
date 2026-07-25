import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { listClientChat } from '@/features/chat/queries';

/** Returns the internal chat messages for a client company (agency only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientCompanyId: string }> },
) {
  const { clientCompanyId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }

  const messages = await listClientChat(clientCompanyId, user.id);
  return NextResponse.json({ messages });
}
