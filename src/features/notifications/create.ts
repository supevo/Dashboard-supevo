import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import type { NotificationType } from '@/lib/database.types';

export interface NotificationInput {
  organizationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType: string;
  entityId?: string | null;
}

/**
 * Creates notifications for recipients. Uses the service client because a
 * notification targets another user (recipient_id != auth.uid()), so it cannot
 * pass the recipient-scoped RLS insert path. Callers must authorize the
 * triggering action first. Recipients equal to `excludeUserId` are skipped so
 * users are never notified about their own action.
 */
export async function createNotifications(
  entries: NotificationInput[],
  excludeUserId?: string,
): Promise<void> {
  const rows = entries
    .filter((e) => e.recipientId !== excludeUserId)
    .map((e) => ({
      organization_id: e.organizationId,
      recipient_id: e.recipientId,
      type: e.type,
      title: e.title,
      body: e.body ?? null,
      entity_type: e.entityType,
      entity_id: e.entityId ?? null,
    }));
  if (rows.length === 0) return;

  const service = createSupabaseServiceClient();
  const { error } = await service.from('notifications').insert(rows);
  if (error) {
    logger.warn('Benachrichtigung konnte nicht erstellt werden', {
      count: rows.length,
    });
  }
}
