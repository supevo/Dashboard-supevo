import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';

/**
 * Turns due reminders into an in-app notification. Runs daily via cron. Picks
 * reminders that are due (due_at <= now), still open and not yet notified, then
 * creates one 'reminder' notification each and marks them notified. Idempotent
 * (notified_at guards against duplicates). Reminders without an organization are
 * skipped for the notification but stay in the user's list.
 */
export async function runReminderScheduler(): Promise<{ notified: number }> {
  const service = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await service
    .from('personal_reminders')
    .select('id, user_id, organization_id, text')
    .is('done_at', null)
    .is('notified_at', null)
    .not('due_at', 'is', null)
    .lte('due_at', nowIso)
    .limit(500);

  const rows = (due ?? []).filter((r) => r.organization_id);
  if (rows.length === 0) return { notified: 0 };

  await createNotifications(
    rows.map((r) => ({
      organizationId: r.organization_id as string,
      recipientId: r.user_id,
      type: 'reminder' as const,
      title: 'Erinnerung',
      body: r.text,
      entityType: 'reminder',
      entityId: r.id,
    })),
  );

  await service
    .from('personal_reminders')
    .update({ notified_at: nowIso })
    .in(
      'id',
      rows.map((r) => r.id),
    );

  return { notified: rows.length };
}
