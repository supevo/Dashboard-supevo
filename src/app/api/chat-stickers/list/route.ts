import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { listStickers } from '@/features/messenger/queries';

/** Returns the caller's org chat stickers (for the chat sticker picker). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ stickers: [] });
  const stickers = await listStickers(orgId);
  return NextResponse.json({ stickers });
}
