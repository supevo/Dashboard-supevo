import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import { isEmailEnabled, sendEmail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
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

  // Fan out to email (best-effort; never blocks or fails the caller's action).
  await sendNotificationEmails(entries, excludeUserId).catch((e) => {
    logger.warn('email.notify.failed', { error: (e as Error).message });
  });
}

/**
 * Emails each recipient about their notification. Recipient email addresses
 * live in auth.users, looked up via the admin API with the service client.
 * No-op when email is not configured.
 */
async function sendNotificationEmails(
  entries: NotificationInput[],
  excludeUserId?: string,
): Promise<void> {
  if (!isEmailEnabled()) return;

  const service = createSupabaseServiceClient();
  const recipients = entries.filter((e) => e.recipientId !== excludeUserId);

  for (const entry of recipients) {
    const { data, error } = await service.auth.admin.getUserById(
      entry.recipientId,
    );
    const email = data?.user?.email;
    if (error || !email) continue;

    const { html, text } = renderEmail({
      heading: entry.title,
      intro: entry.body ?? 'Es gibt eine neue Aktivität in Ihrem Dashboard.',
      ctaLabel: 'Im Dashboard öffnen',
      ctaUrl: env.NEXT_PUBLIC_APP_URL,
      footer:
        'Sie erhalten diese E-Mail, weil Sie eine Benachrichtigung im Supevo Dashboard haben.',
    });
    await sendEmail({ to: email, subject: entry.title, html, text });
  }
}
