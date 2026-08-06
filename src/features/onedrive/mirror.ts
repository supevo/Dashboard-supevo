import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';
import { isOneDriveConfigured } from '@/lib/onedrive/config';
import { uploadToFolder } from '@/lib/onedrive/graph';
import { getClientFolder } from '@/features/onedrive/queries';
import { logger } from '@/lib/logger';

/**
 * Best-effort: mirrors a freshly uploaded task file into the client's mapped
 * OneDrive folder. Never throws – a mirror failure must not break the upload.
 * No-op when OneDrive is not configured or the client has no mapped folder.
 */
export async function mirrorTaskFileToOneDrive(params: {
  orgId: string;
  clientCompanyId: string | null;
  storagePath: string;
  fileName: string;
  mime: string;
}): Promise<void> {
  try {
    if (!isOneDriveConfigured() || !params.clientCompanyId) return;
    const folder = await getClientFolder(params.orgId, params.clientCompanyId);
    if (!folder) return;

    const service = createSupabaseServiceClient();
    const { data: blob } = await service.storage
      .from(FILES_BUCKET)
      .download(params.storagePath);
    if (!blob) return;
    const bytes = Buffer.from(await blob.arrayBuffer());

    await uploadToFolder(
      params.orgId,
      folder.folderId,
      params.fileName,
      bytes,
      params.mime,
    );
  } catch (e) {
    logger.warn('onedrive.mirror_failed', { error: (e as Error).message });
  }
}
