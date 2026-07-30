import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/**
 * Deletes chat files that are older than their 60-day expiry and NOT marked as
 * important (file_keep). Removes the storage object and flags the message
 * (file_removed = true, path cleared) so it renders as "auto-deleted".
 */
export async function runChatFileCleanup(): Promise<{ removed: number }> {
  const service = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await service
    .from('chat_channel_messages')
    .select('id, file_path')
    .not('file_path', 'is', null)
    .eq('file_keep', false)
    .eq('file_removed', false)
    .lt('file_expires_at', nowIso)
    .limit(500);
  if (!due || due.length === 0) return { removed: 0 };

  const paths = due
    .map((m) => m.file_path)
    .filter((p): p is string => Boolean(p));
  try {
    if (paths.length > 0) await service.storage.from(FILES_BUCKET).remove(paths);
  } catch (e) {
    logger.warn('chat_file.cleanup.storage_failed', { error: (e as Error).message });
  }

  let removed = 0;
  for (const m of due) {
    const { error } = await service
      .from('chat_channel_messages')
      .update({ file_removed: true, file_path: null })
      .eq('id', m.id);
    if (!error) removed += 1;
  }
  return { removed };
}
