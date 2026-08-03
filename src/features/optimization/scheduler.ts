import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { runWorkloadOptimization } from '@/features/optimization/engine';

const INTERVAL_DAYS: Record<string, number> = {
  daily: 1,
  every_2_days: 2,
  weekly: 7,
};

/**
 * Cron entry point: for every org with the automatic mode on and its cadence
 * due, run the optimization, apply the changes and notify the org's admins with
 * a short summary. Runs unattended – no page visit or confirmation needed.
 */
export async function runOptimizationScheduler(): Promise<{
  orgsRun: number;
  totalChanges: number;
}> {
  const service = createSupabaseServiceClient();
  const now = Date.now();

  const { data: rows } = await service
    .from('work_optimization_settings')
    .select('organization_id, cadence, auto_apply, reassign, last_run_at')
    .eq('auto_apply', true)
    .neq('cadence', 'off');

  let orgsRun = 0;
  let totalChanges = 0;

  for (const row of rows ?? []) {
    const intervalDays = INTERVAL_DAYS[row.cadence];
    if (!intervalDays) continue;
    const due =
      !row.last_run_at ||
      now - new Date(row.last_run_at).getTime() >= intervalDays * 86_400_000 - 60_000;
    if (!due) continue;

    const result = await runWorkloadOptimization(row.organization_id, null, {
      reassign: row.reassign,
    });
    orgsRun++;
    totalChanges += result.assigned + result.reassigned;

    await service.from('work_optimization_settings').upsert(
      {
        organization_id: row.organization_id,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    );

    // Notify the org's admins with a summary.
    const { data: admins } = await service
      .from('memberships')
      .select('user_id, role')
      .eq('organization_id', row.organization_id)
      .eq('status', 'active');
    const adminIds = [
      ...new Set(
        (admins ?? [])
          .filter((m) => m.role === 'agency_admin' || m.role === 'super_admin')
          .map((m) => m.user_id),
      ),
    ];
    if (adminIds.length === 0) continue;

    const total = result.assigned + result.reassigned;
    const body =
      total === 0
        ? 'Automatische Optimierung ausgeführt – nichts zu ändern, die Verteilung passt.'
        : `Automatische Optimierung: ${result.assigned} zugewiesen, ${result.reassigned} umverteilt.\n\n` +
          result.changes.slice(0, 10).join('\n');
    await createNotifications(
      adminIds.map((recipientId) => ({
        organizationId: row.organization_id,
        recipientId,
        type: 'optimization' as const,
        title: '🤖 KI-Arbeitsoptimierung ausgeführt',
        body,
        entityType: 'optimization',
        entityId: null,
      })),
    );
  }

  return { orgsRun, totalChanges };
}
