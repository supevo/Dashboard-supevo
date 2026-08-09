import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId, hasAgencyAccess } from '@/features/auth/access';
import { isOrgAdmin, isSuperAdmin } from '@/lib/authz/policies';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  listFolder,
  resolveFolderByPath,
  getItemMeta,
} from '@/lib/onedrive/graph';
import { getClientFolder } from '@/features/onedrive/queries';

/**
 * Lists a OneDrive folder's children for the picker (agency staff). When a base
 * folder is configured (onedrive_connections.root_path, e.g. "ONE STEP/Kunden"),
 * navigation is confined to that subtree – the rest of the personal OneDrive is
 * never listed.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

  const requestedId = request.nextUrl.searchParams.get('folderId');
  const requested = requestedId && requestedId.length > 0 ? requestedId : null;

  // Client-scoped browsing: confine navigation to the folder mapped to this
  // client company (the "Dateien"-Tab uses this). Navigation can never leave the
  // client's subtree.
  const clientCompanyId = request.nextUrl.searchParams.get('clientCompanyId');
  if (clientCompanyId) {
    const cf = await getClientFolder(orgId, clientCompanyId);
    if (!cf) {
      return NextResponse.json({ error: 'no_folder', items: [] }, { status: 200 });
    }
    const baseMeta = await getItemMeta(orgId, cf.folderId);
    if (!baseMeta) {
      return NextResponse.json({ error: 'not_connected', items: [] });
    }
    const basePath = `${baseMeta.parentPath}/${baseMeta.name}`;

    const targetId = requested ?? cf.folderId;
    if (requested && requested !== cf.folderId) {
      const meta = await getItemMeta(orgId, requested);
      const inside =
        meta != null &&
        (meta.parentPath === basePath || meta.parentPath.startsWith(`${basePath}/`));
      if (!inside) {
        return NextResponse.json({ error: 'out_of_scope', items: [] }, { status: 403 });
      }
    }
    const items = await listFolder(orgId, targetId);
    if (items === null) {
      return NextResponse.json({ error: 'not_connected', items: [] });
    }
    return NextResponse.json({ items, baseId: cf.folderId });
  }

  // Full-drive browsing (Finanzen/Buchhaltung): admins may pick a folder above
  // the configured staff base – e.g. an Über-/Root-Ordner. Bypasses the
  // root_path confinement entirely; gated to org admins / super-admins.
  const fullDrive = request.nextUrl.searchParams.get('scope') === 'full';
  if (fullDrive) {
    if (!isOrgAdmin(user, orgId) && !isSuperAdmin(user)) {
      return NextResponse.json({ error: 'forbidden', items: [] }, { status: 403 });
    }
    const items = await listFolder(orgId, requested);
    if (items === null) {
      return NextResponse.json({ error: 'not_connected', items: [] });
    }
    return NextResponse.json({ items });
  }

  // Resolve the configured base folder, if any.
  const service = createSupabaseServiceClient();
  const { data: conn } = await service
    .from('onedrive_connections')
    .select('root_path')
    .eq('organization_id', orgId)
    .maybeSingle();
  const rootPath = conn?.root_path?.trim() || null;

  if (rootPath) {
    const base = await resolveFolderByPath(orgId, rootPath);
    if (!base) {
      return NextResponse.json({ error: 'root_not_found', items: [] }, { status: 200 });
    }
    // Without an explicit folder, start at the base folder's children.
    if (!requested) {
      const items = await listFolder(orgId, base.id);
      if (items === null) {
        return NextResponse.json({ error: 'not_connected', items: [] });
      }
      return NextResponse.json({ items, baseId: base.id });
    }
    // With a folder id, verify it is the base itself or lives inside its subtree.
    const meta = await getItemMeta(orgId, requested);
    const inside =
      meta != null &&
      (meta.id === base.id ||
        meta.parentPath === base.path ||
        meta.parentPath.startsWith(`${base.path}/`));
    if (!inside) {
      return NextResponse.json({ error: 'out_of_scope', items: [] }, { status: 403 });
    }
  }

  const items = await listFolder(orgId, requested);
  if (items === null) {
    return NextResponse.json({ error: 'not_connected', items: [] });
  }
  return NextResponse.json({ items });
}
