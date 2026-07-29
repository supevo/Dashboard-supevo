import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { currentIsoWeek, weekToPeriod } from './week';

/**
 * Weekly nudge: for every client company that has active projects but no
 * marketing report for the CURRENT ISO week yet, notifies the staff working on
 * that client to write the weekly report. Runs via the service client (cron).
 */
export async function runWeeklyReportReminders(): Promise<{
  clients: number;
  reminded: number;
}> {
  const service = createSupabaseServiceClient();
  const period = weekToPeriod(currentIsoWeek());
  if (!period) return { clients: 0, reminded: 0 };

  // Clients that already have this week's report → skip.
  const { data: existing } = await service
    .from('marketing_reports')
    .select('client_company_id')
    .eq('period_start', period.periodStart);
  const done = new Set((existing ?? []).map((r) => r.client_company_id));

  const { data: companies } = await service
    .from('client_companies')
    .select('id, name, organization_id')
    .limit(2000);
  if (!companies || companies.length === 0) return { clients: 0, reminded: 0 };

  let clients = 0;
  let reminded = 0;

  for (const company of companies) {
    if (done.has(company.id)) continue;

    const { data: projects } = await service
      .from('projects')
      .select('id')
      .eq('client_company_id', company.id)
      .is('deleted_at', null);
    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) continue;

    const { data: members } = await service
      .from('project_members')
      .select('user_id')
      .in('project_id', projectIds);
    const recipientIds = [...new Set((members ?? []).map((m) => m.user_id))];
    if (recipientIds.length === 0) continue;

    await createNotifications(
      recipientIds.map((recipientId) => ({
        organizationId: company.organization_id,
        recipientId,
        type: 'weekly_report_due' as const,
        title: 'Wochenbericht fällig',
        body: `Für „${company.name}" fehlt noch der Wochenbericht (${period.periodLabel}).`,
        entityType: 'client_company',
        entityId: company.id,
      })),
    );
    clients += 1;
    reminded += recipientIds.length;
  }

  return { clients, reminded };
}
