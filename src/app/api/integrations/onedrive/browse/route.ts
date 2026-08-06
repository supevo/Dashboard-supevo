import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId, hasAgencyAccess } from '@/features/auth/access';
import { listFolder } from '@/lib/onedrive/graph';

/** Lists a OneDrive folder's children for the picker (agency staff). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

  const folderId = request.nextUrl.searchParams.get('folderId');
  const items = await listFolder(orgId, folderId && folderId.length > 0 ? folderId : null);
  if (items === null) {
    return NextResponse.json({ error: 'not_connected', items: [] }, { status: 200 });
  }
  return NextResponse.json({ items });
}
