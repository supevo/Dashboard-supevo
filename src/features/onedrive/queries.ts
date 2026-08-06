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
}

/** Connection status for the org (settings card). */
export async function getOneDriveStatus(orgId: string): Promise<OneDriveStatus> {
  const configured = isOneDriveConfigured();
  const vaultReady = isSecretVaultEnabled();
  let connected = false;
  let accountLabel: string | null = null;
  let rootPath: string | null = null;
  if (configured) {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from('onedrive_connections')
      .select('account_label, root_path')
      .eq('organization_id', orgId)
      .maybeSingle();
    connected = Boolean(data);
    accountLabel = data?.account_label ?? null;
    rootPath = data?.root_path ?? null;
  }
  return { configured, vaultReady, connected, accountLabel, rootPath };
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
