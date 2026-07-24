import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

export const FILES_BUCKET = 'files';
export const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Mints a short-lived signed URL for a stored object.
 *
 * The caller MUST have already authorized access to the file (via the
 * files-table RLS check). Signing is attempted first with the service-role
 * client so that clients — whose organization differs from the file's storage
 * organization — can still read their client-visible files. If the service
 * client is unavailable or fails (e.g. the service-role key is not configured
 * in this environment), we fall back to signing with the caller's own client,
 * which succeeds for same-organization users (agency staff). Both paths log the
 * underlying error so misconfiguration is diagnosable from server logs.
 */
export async function createSignedFileUrl(
  userClient: SupabaseClient,
  storagePath: string,
  disposition: 'inline' | 'attachment',
): Promise<string | null> {
  const download = disposition === 'attachment';

  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.storage
      .from(FILES_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download });
    if (!error && data?.signedUrl) return data.signedUrl;
    logger.warn('files.sign.service_failed', { error: error?.message });
  } catch (e) {
    logger.warn('files.sign.service_unavailable', {
      error: (e as Error).message,
    });
  }

  // Fallback: sign with the caller's authenticated client (storage RLS applies).
  const { data, error } = await userClient.storage
    .from(FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download });
  if (!error && data?.signedUrl) return data.signedUrl;
  logger.error('files.sign.fallback_failed', { error: error?.message });
  return null;
}

/**
 * Creates a signed upload target so the browser can upload file bytes DIRECTLY
 * to Supabase Storage, bypassing the serverless request-body size limit
 * (~4.5 MB on Vercel). The returned token authorizes exactly one write to
 * `storagePath`. Tries the service-role client first (works for every caller),
 * then falls back to the caller's own client (agency/same-org).
 */
export async function createSignedUploadTarget(
  userClient: SupabaseClient,
  storagePath: string,
): Promise<{ path: string; token: string } | null> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.storage
      .from(FILES_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (!error && data?.token) return { path: data.path, token: data.token };
    logger.warn('files.upload_sign.service_failed', { error: error?.message });
  } catch (e) {
    logger.warn('files.upload_sign.service_unavailable', {
      error: (e as Error).message,
    });
  }

  const { data, error } = await userClient.storage
    .from(FILES_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (!error && data?.token) return { path: data.path, token: data.token };
  logger.error('files.upload_sign.fallback_failed', { error: error?.message });
  return null;
}
