import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secret-vault';
import { logger } from '@/lib/logger';
import {
  getOneDriveConfig,
  oneDriveScopes,
  tokenUrl,
  type OneDriveConfig,
} from '@/lib/onedrive/config';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export interface DriveItem {
  id: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  childCount: number | null;
}

/**
 * Exchanges the org's stored refresh token for a fresh access token. Rotates and
 * re-stores the refresh token when Microsoft returns a new one. Returns null when
 * unconfigured, not connected, or the secret vault is unavailable.
 */
async function getAccessToken(orgId: string): Promise<string | null> {
  const config = getOneDriveConfig();
  if (!config) return null;

  const service = createSupabaseServiceClient();
  const { data: conn } = await service
    .from('onedrive_connections')
    .select('refresh_token_enc')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!conn?.refresh_token_enc) return null;

  const refreshToken = decryptSecret(conn.refresh_token_enc);
  if (!refreshToken) {
    logger.error('onedrive.token.decrypt_failed', { orgId });
    return null;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: oneDriveScopes(),
    redirect_uri: config.redirectUri,
  });

  const res = await fetch(tokenUrl(config), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    logger.error('onedrive.token.refresh_failed', {
      orgId,
      status: res.status,
    });
    return null;
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  // Rotate the refresh token if a new one was issued.
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    const enc = encryptSecret(json.refresh_token);
    if (enc) {
      await service
        .from('onedrive_connections')
        .update({ refresh_token_enc: enc, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId);
    }
  }
  return json.access_token ?? null;
}

/** Completes the OAuth code exchange and stores the encrypted refresh token. */
export async function exchangeCodeAndStore(
  orgId: string,
  userId: string,
  code: string,
): Promise<
  | { ok: true; label: string | null }
  | { ok: false; error: string; detail?: string }
> {
  const config = getOneDriveConfig();
  if (!config) return { ok: false, error: 'not_configured' };

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    scope: oneDriveScopes(),
  });
  const res = await fetch(tokenUrl(config), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error('onedrive.code_exchange_failed', { status: res.status });
    return {
      ok: false,
      error: 'exchange_failed',
      detail: `HTTP ${res.status} ${text.slice(0, 200)}`,
    };
  }
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
  };
  if (!json.refresh_token) return { ok: false, error: 'no_refresh_token' };

  const enc = encryptSecret(json.refresh_token);
  if (!enc) return { ok: false, error: 'vault_unavailable' };

  // Best-effort: read the account's display name for the label.
  let label: string | null = null;
  if (json.access_token) {
    try {
      const me = await fetch(`${GRAPH}/me`, {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      if (me.ok) {
        const p = (await me.json()) as {
          userPrincipalName?: string;
          mail?: string;
          displayName?: string;
        };
        label = p.mail ?? p.userPrincipalName ?? p.displayName ?? null;
      }
    } catch {
      /* label is optional */
    }
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.from('onedrive_connections').upsert(
    {
      organization_id: orgId,
      connected_by: userId,
      account_label: label,
      refresh_token_enc: enc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );
  if (error) {
    logger.error('onedrive.store_failed', { error: error.message });
    return { ok: false, error: 'store_failed', detail: error.message };
  }
  return { ok: true, label };
}

function mapItem(raw: Record<string, unknown>): DriveItem {
  const folder = raw.folder as { childCount?: number } | undefined;
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    isFolder: Boolean(folder),
    size: typeof raw.size === 'number' ? raw.size : null,
    childCount: folder?.childCount ?? null,
  };
}

export interface ResolvedFolder {
  id: string;
  /** Graph self-path, e.g. "/drive/root:/ONE STEP/Kunden". */
  path: string;
}

/** Resolves a folder by its path under the drive root (e.g. "ONE STEP/Kunden"). */
export async function resolveFolderByPath(
  orgId: string,
  path: string,
): Promise<ResolvedFolder | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const res = await fetch(
    `${GRAPH}/me/drive/root:/${encodeURI(clean)}?$select=id,name,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    id?: string;
    name?: string;
    parentReference?: { path?: string };
  };
  if (!j.id) return null;
  const parent = j.parentReference?.path ?? '/drive/root:';
  return { id: j.id, path: `${parent}/${j.name ?? ''}` };
}

/** Fetches an item's id/name and its parent path (for subtree containment). */
export async function getItemMeta(
  orgId: string,
  itemId: string,
): Promise<{ id: string; name: string; parentPath: string } | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    id?: string;
    name?: string;
    parentReference?: { path?: string };
  };
  if (!j.id) return null;
  return { id: j.id, name: j.name ?? '', parentPath: j.parentReference?.path ?? '' };
}

/** Lists children of a folder (root when folderId is null). */
export async function listFolder(
  orgId: string,
  folderId: string | null,
): Promise<DriveItem[] | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const path = folderId
    ? `/me/drive/items/${encodeURIComponent(folderId)}/children`
    : '/me/drive/root/children';
  const res = await fetch(
    `${GRAPH}${path}?$select=id,name,folder,size&$top=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    logger.warn('onedrive.list_failed', { status: res.status });
    return null;
  }
  const json = (await res.json()) as { value?: Record<string, unknown>[] };
  return (json.value ?? []).map(mapItem);
}

/** Downloads a drive item's bytes. */
export async function downloadItem(
  orgId: string,
  itemId: string,
): Promise<{ bytes: Buffer; name: string; mime: string } | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;

  const meta = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}?$select=name,file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!meta.ok) return null;
  const m = (await meta.json()) as {
    name?: string;
    file?: { mimeType?: string };
  };

  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    name: m.name ?? 'datei',
    mime: m.file?.mimeType ?? 'application/octet-stream',
  };
}

/**
 * Uploads bytes into a folder (simple upload, up to ~250 MB). Returns the new
 * item id, or null on failure. Used to mirror task uploads into a client folder.
 */
export async function uploadToFolder(
  orgId: string,
  folderId: string,
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<string | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  // Encode the file name for the path segment (Graph :/name:/content addressing).
  const safeName = encodeURIComponent(fileName);
  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(folderId)}:/${safeName}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
    },
  );
  if (!res.ok) {
    logger.warn('onedrive.upload_failed', { status: res.status });
    return null;
  }
  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}

/**
 * Creates a resumable upload session for a folder and returns the pre-authorized
 * uploadUrl the browser can PUT the bytes to directly (bypasses our server).
 */
export async function createUploadSession(
  orgId: string,
  folderId: string,
  fileName: string,
): Promise<{ uploadUrl: string } | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const safeName = encodeURIComponent(fileName);
  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(folderId)}:/${safeName}:/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: { '@microsoft.graph.conflictBehavior': 'rename' },
      }),
    },
  );
  if (!res.ok) {
    logger.warn('onedrive.upload_session_failed', { status: res.status });
    return null;
  }
  const json = (await res.json()) as { uploadUrl?: string };
  return json.uploadUrl ? { uploadUrl: json.uploadUrl } : null;
}

/**
 * Returns a short-lived, pre-authenticated direct download URL for an item so we
 * can redirect the browser to it (no bytes through our server, no API cost for
 * the transfer). Also returns basic metadata.
 */
export async function getDownloadUrl(
  orgId: string,
  itemId: string,
): Promise<{ url: string; name: string; mime: string } | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,file,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    name?: string;
    file?: { mimeType?: string };
    '@microsoft.graph.downloadUrl'?: string;
  };
  const url = j['@microsoft.graph.downloadUrl'];
  if (!url) return null;
  return {
    url,
    name: j.name ?? 'datei',
    mime: j.file?.mimeType ?? 'application/octet-stream',
  };
}

/** Deletes a drive item (best-effort). */
export async function deleteItem(orgId: string, itemId: string): Promise<boolean> {
  const token = await getAccessToken(orgId);
  if (!token) return false;
  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  return res.ok || res.status === 404;
}

/**
 * Ensures a folder exists at the given path under the drive root (creating each
 * missing segment) and returns its id. Used for the collection folder.
 */
export async function ensureFolderByPath(
  orgId: string,
  path: string,
): Promise<string | null> {
  const existing = await resolveFolderByPath(orgId, path);
  if (existing) return existing.id;

  const token = await getAccessToken(orgId);
  if (!token) return null;
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const createRes = await fetch(
      parentId
        ? `${GRAPH}/me/drive/items/${encodeURIComponent(parentId)}/children`
        : `${GRAPH}/me/drive/root/children`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
    );
    if (createRes.ok) {
      const created = (await createRes.json()) as { id?: string };
      parentId = created.id ?? null;
    } else {
      // Already exists (409) or other → resolve the path built so far.
      const resolved = await resolveFolderByPath(
        orgId,
        segments.slice(0, i + 1).join('/'),
      );
      parentId = resolved?.id ?? null;
    }
    if (!parentId) return null;
  }
  return parentId;
}

/**
 * Ensures a child folder with `name` exists under `parentId`, returning its id.
 * Reuses an existing child of the same name (case-insensitive) or creates it.
 */
export async function ensureChildFolder(
  orgId: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const token = await getAccessToken(orgId);
  if (!token) return null;
  const clean = name.trim();
  if (!clean) return parentId;

  const existing = await listFolder(orgId, parentId);
  const hit = existing?.find(
    (i) => i.isFolder && i.name.toLowerCase() === clean.toLowerCase(),
  );
  if (hit) return hit.id;

  const res = await fetch(
    `${GRAPH}/me/drive/items/${encodeURIComponent(parentId)}/children`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: clean,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    },
  );
  if (res.ok) {
    const created = (await res.json()) as { id?: string };
    return created.id ?? null;
  }
  // Lost a race / already exists → re-list and match.
  const again = await listFolder(orgId, parentId);
  return (
    again?.find(
      (i) => i.isFolder && i.name.toLowerCase() === clean.toLowerCase(),
    )?.id ?? null
  );
}

/** Ensures a chain of nested subfolders under `rootId`, returning the deepest id. */
export async function ensureSubfolderPath(
  orgId: string,
  rootId: string,
  segments: string[],
): Promise<string | null> {
  let current = rootId;
  for (const seg of segments) {
    const next = await ensureChildFolder(orgId, current, seg);
    if (!next) return null;
    current = next;
  }
  return current;
}

/**
 * Collects every file (non-folder) under `rootId`, descending into subfolders
 * (year/month structures). Bounded by node + file caps so a huge tree can't run
 * away. Returns null only if the connection itself is unavailable.
 */
export async function listFolderFilesRecursive(
  orgId: string,
  rootId: string | null,
  opts: { maxFiles?: number; maxNodes?: number } = {},
): Promise<DriveItem[] | null> {
  const maxFiles = opts.maxFiles ?? 5000;
  const maxNodes = opts.maxNodes ?? 800;
  const queue: (string | null)[] = [rootId];
  const files: DriveItem[] = [];
  let nodes = 0;
  let anyOk = false;

  while (queue.length > 0 && nodes < maxNodes && files.length < maxFiles) {
    const folderId = queue.shift() ?? null;
    nodes += 1;
    const items = await listFolder(orgId, folderId);
    if (items === null) continue;
    anyOk = true;
    for (const item of items) {
      if (item.isFolder) queue.push(item.id);
      else files.push(item);
    }
  }
  if (!anyOk) return null;
  return files;
}

export function graphConfigured(): OneDriveConfig | null {
  return getOneDriveConfig();
}
