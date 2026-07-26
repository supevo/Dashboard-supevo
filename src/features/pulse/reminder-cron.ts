import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { weekStartOf } from './week';

/**
 * Weekly job (Fridays): nudges agency staff who have not submitted their pulse
 * check for the current week. Runs via the service client. Idempotent within a
 * week — users who already got a reminder (or already answered) are skipped.
 */
export async function runPulseReminders(): Promise<{ reminded: number }> {
  const service = createSupabaseServiceClient();
  const weekStart = weekStartOf();

  const { data: orgs } = await service.from('organizations').select('id');
  if (!orgs || orgs.length === 0) return { reminded: 0 };

  let reminded = 0;
  for (const org of orgs) {
    const { data: memberships } = await service
      .from('memberships')
      .select('user_id, role')
      .eq('organization_id', org.id)
      .eq('status', 'active');
    const staffIds = [
      ...new Set(
        (memberships ?? [])
          .filter((m) => m.role !== 'client')
          .map((m) => m.user_id),
      ),
    ];
    if (staffIds.length === 0) continue;

    // Already answered this week.
    const { data: answered } = await service
      .from('pulse_checks')
      .select('user_id')
      .eq('organization_id', org.id)
      .eq('week_start', weekStart);
    const answeredIds = new Set((answered ?? []).map((a) => a.user_id));

    // Already reminded this week (idempotency across retries).
    const { data: alreadyReminded } = await service
      .from('notifications')
      .select('recipient_id')
      .eq('organization_id', org.id)
      .eq('type', 'pulse_reminder')
      .gte('created_at', `${weekStart}T00:00:00`);
    const remindedIds = new Set((alreadyReminded ?? []).map((n) => n.recipient_id));

    const targets = staffIds.filter(
      (id) => !answeredIds.has(id) && !remindedIds.has(id),
    );
    if (targets.length === 0) continue;

    await createNotifications(
      targets.map((recipientId) => ({
        organizationId: org.id,
        recipientId,
        type: 'pulse_reminder' as const,
        title: 'Wie war deine Woche?',
        body: 'Kurzes Stimmungsbild – dein Feedback hilft dem Team. Dauert 10 Sekunden.',
        entityType: 'pulse',
        entityId: null,
      })),
    );
    reminded += targets.length;
  }

  return { reminded };
}
