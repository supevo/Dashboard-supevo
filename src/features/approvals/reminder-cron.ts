import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';

// A pending approval is nudged once it is this old, then again after each gap.
// Der Kunde soll alle 2 Tage erinnert werden, bis er die Freigabe erteilt.
const REMIND_AFTER_DAYS = 2;
const REMIND_GAP_DAYS = 2;

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * Nudges clients about approvals they have left pending. Creates an in-app
 * notification per contact (which also fans out to email) and stamps
 * last_reminder_at so the same approval is not nudged again before the gap
 * elapses. Runs via the service client (bypasses RLS); called by cron.
 */
export async function runDueApprovalReminders(): Promise<{ reminded: number }> {
  const service = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const ageCutoff = daysAgo(REMIND_AFTER_DAYS);
  const gapCutoff = daysAgo(REMIND_GAP_DAYS);

  const { data: approvals } = await service
    .from('approvals')
    .select(
      'id, title, task_id, client_company_id, organization_id, created_at, last_reminder_at',
    )
    .eq('status', 'pending')
    .lte('created_at', ageCutoff)
    .or(`last_reminder_at.is.null,last_reminder_at.lte.${gapCutoff}`)
    .limit(200);
  if (!approvals || approvals.length === 0) return { reminded: 0 };

  let reminded = 0;
  for (const a of approvals) {
    const { data: contacts } = await service
      .from('client_contacts')
      .select('user_id')
      .eq('client_company_id', a.client_company_id);
    const contactIds = (contacts ?? []).map((c) => c.user_id);

    if (contactIds.length > 0) {
      await createNotifications(
        contactIds.map((recipientId) => ({
          organizationId: a.organization_id,
          recipientId,
          type: 'task_for_approval' as const,
          title: 'Erinnerung: Freigabe ausstehend',
          body: `Bitte geben Sie „${a.title}" frei oder hinterlassen Sie einen Kommentar.`,
          entityType: 'task',
          entityId: a.task_id,
        })),
      );
    }

    const { error } = await service
      .from('approvals')
      .update({ last_reminder_at: nowIso })
      .eq('id', a.id);
    if (error) {
      logger.warn('approval.reminder.update_failed', {
        id: a.id,
        error: error.message,
      });
      continue;
    }
    reminded++;
  }

  return { reminded };
}
