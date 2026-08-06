import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isOneDriveConfigured } from '@/lib/onedrive/config';
import { ensureFolderByPath } from '@/lib/onedrive/graph';
import { getClientFolder } from '@/features/onedrive/queries';
import { logger } from '@/lib/logger';

export interface OneDrivePrimaryConfig {
  /** OneDrive is configured server-side and connected for this org. */
  active: boolean;
  /** The "OneDrive as primary attachment storage" switch is on. */
  primary: boolean;
  collectionPath: string;
}

/** Reads whether attachments should go to OneDrive for this org, plus paths. */
export async function getOneDrivePrimaryConfig(
  orgId: string,
): Promise<OneDrivePrimaryConfig> {
  if (!isOneDriveConfigured()) {
    return { active: false, primary: false, collectionPath: '_Anhänge' };
  }
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('onedrive_connections')
    .select('primary_attachments, collection_folder_path, root_path')
    .eq('organization_id', orgId)
    .maybeSingle();
  const active = Boolean(data); // a row exists → connected
  const root = data?.root_path?.trim();
  const collectionPath =
    data?.collection_folder_path?.trim() ||
    (root ? `${root}/_Anhänge` : '_Anhänge');
  return {
    active,
    primary: Boolean(data?.primary_attachments),
    collectionPath,
  };
}

export type AttachmentTarget =
  | { ok: true; folderId: string }
  | { ok: false; code: 'mapping_missing' | 'unavailable' };

/**
 * Resolves the OneDrive folder a task attachment should be stored in:
 * the client's mapped folder, or the collection folder for internal uploads
 * (no client company). Missing client mapping is a distinct, actionable error.
 */
export async function resolveAttachmentTarget(
  orgId: string,
  clientCompanyId: string | null,
  collectionPath: string,
): Promise<AttachmentTarget> {
  if (clientCompanyId) {
    const folder = await getClientFolder(orgId, clientCompanyId);
    if (!folder) return { ok: false, code: 'mapping_missing' };
    return { ok: true, folderId: folder.folderId };
  }
  const id = await ensureFolderByPath(orgId, collectionPath);
  if (!id) return { ok: false, code: 'unavailable' };
  return { ok: true, folderId: id };
}

/** Records a failed OneDrive upload so the super-admin can see problems. */
export async function recordUploadError(
  orgId: string,
  clientCompanyId: string | null,
  fileName: string | null,
  reason: string,
): Promise<void> {
  try {
    await createSupabaseServiceClient()
      .from('onedrive_upload_errors')
      .insert({
        organization_id: orgId,
        client_company_id: clientCompanyId,
        file_name: fileName,
        reason,
      });
  } catch (e) {
    logger.warn('onedrive.record_error_failed', { error: (e as Error).message });
  }
}
