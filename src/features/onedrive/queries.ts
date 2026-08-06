import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isOneDriveConfigured } from '@/lib/onedrive/config';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';

export interface OneDriveStatus {
  /** MS_CLIENT_ID/SECRET set on the server. */
  configured: boolean;
  /** Secret vault key present (needed to store the token). */
  vaultReady: boolean;
  /** A OneDrive account is connected for this org. */
  connected: boolean;
  accountLabel: string | null;
  /** Base folder the app is confined to (e.g. "ONE STEP/Kunden"), or null. */
  rootPath: string | null;
  /** Task attachments are stored only in OneDrive when true. */
  primaryAttachments: boolean;
  /** Folder for attachments without a client mapping. */
  collectionFolderPath: string | null;
}

/** Connection status for the org (settings card). */
export async function getOneDriveStatus(orgId: string): Promise<OneDriveStatus> {
  const configured = isOneDriveConfigured();
  const vaultReady = isSecretVaultEnabled();
  let connected = false;
  let accountLabel: string | null = null;
  let rootPath: string | null = null;
  let primaryAttachments = false;
  let collectionFolderPath: string | null = null;
  if (configured) {
    const service = createSupabaseServiceClient();
    // Connected check uses only columns from the base migration (0103), so the
    // status is correct even if 0104/0105 have not been applied yet.
    const { data: base } = await service
      .from('onedrive_connections')
      .select('organization_id, account_label')
      .eq('organization_id', orgId)
      .maybeSingle();
    connected = Boolean(base);
    accountLabel = base?.account_label ?? null;

    if (connected) {
      // Optional columns from later migrations – tolerate if not yet applied
      // (the query returns null instead of throwing).
      const { data: ext } = await service
        .from('onedrive_connections')
        .select('root_path, primary_attachments, collection_folder_path')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (ext) {
        rootPath = ext.root_path ?? null;
        primaryAttachments = Boolean(ext.primary_attachments);
        collectionFolderPath = ext.collection_folder_path ?? null;
      }
    }
  }
  return {
    configured,
    vaultReady,
    connected,
    accountLabel,
    rootPath,
    primaryAttachments,
    collectionFolderPath,
  };
}

export interface OneDriveUploadError {
  id: string;
  clientCompanyId: string | null;
  fileName: string | null;
  reason: string;
  createdAt: string;
}

/** Recent OneDrive upload problems for the org (super-admin diagnostics). */
export async function listOneDriveUploadErrors(
  orgId: string,
  limit = 20,
): Promise<OneDriveUploadError[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('onedrive_upload_errors')
    .select('id, client_company_id, file_name, reason, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    clientCompanyId: r.client_company_id,
    fileName: r.file_name,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export interface ClientFolder {
  folderId: string;
  folderPath: string | null;
}

/** The OneDrive folder mapped to a client company, if any. */
export async function getClientFolder(
  orgId: string,
  clientCompanyId: string,
): Promise<ClientFolder | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('onedrive_folder_map')
    .select('folder_id, folder_path')
    .eq('organization_id', orgId)
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!data) return null;
  return { folderId: data.folder_id, folderPath: data.folder_path };
}
