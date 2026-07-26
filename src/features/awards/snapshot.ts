import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';
import { computeAwards, type AwardWinner } from './engine';

export interface AwardSnapshot {
  year: number;
  month: number;
  monthLabel: string;
  overall: AwardWinner | null;
  quality: AwardWinner | null;
  reliability: AwardWinner | null;
  team: AwardWinner | null;
}

/** Year/month of the month that just ended, relative to `ref` (Berlin-safe). */
function previousMonth(ref: Date = new Date()): { year: number; month: number } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() + 1; // 1-12 (current)
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

/**
 * Computes the awards for one org/month and upserts the frozen snapshot. Returns
 * the computed awards so the caller can notify winners.
 */
export async function snapshotAwardsForOrg(
  orgId: string,
  year: number,
  month: number,
): Promise<AwardSnapshot> {
  const service = createSupabaseServiceClient();
  const awards = await computeAwards(orgId, year, month);

  const { error } = await service.from('award_snapshots').upsert(
    {
      organization_id: orgId,
      year,
      month,
      month_label: awards.monthLabel,
      overall: awards.overall,
      quality: awards.quality,
      reliability: awards.reliability,
      team: awards.team,
      rows: awards.rows,
    },
    { onConflict: 'organization_id,year,month' },
  );
  if (error) {
    logger.warn('award.snapshot.upsert_failed', { orgId, year, month, error: error.message });
  }

  return {
    year,
    month,
    monthLabel: awards.monthLabel,
    overall: awards.overall,
    quality: awards.quality,
    reliability: awards.reliability,
    team: awards.team,
  };
}

/**
 * Monthly job: freezes the previous month's awards for every organization and
 * notifies the winners. Idempotent — re-running upserts the same snapshot and
 * skips winner notices that already exist for that month.
 */
export async function runMonthlyAwardSnapshot(): Promise<{ orgs: number; notified: number }> {
  const service = createSupabaseServiceClient();
  const { year, month } = previousMonth();

  const { data: orgs } = await service.from('organizations').select('id');
  if (!orgs || orgs.length === 0) return { orgs: 0, notified: 0 };

  let notified = 0;
  for (const org of orgs) {
    const snap = await snapshotAwardsForOrg(org.id, year, month);

    // Notify each distinct winner (overall + categories) once.
    const winners = new Map<string, AwardWinner>();
    for (const w of [snap.overall, snap.quality, snap.reliability, snap.team]) {
      if (w) winners.set(w.userId, w);
    }
    if (winners.size === 0) continue;

    // Skip if this org+month already produced award notifications (idempotency).
    const { count: existing } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('type', 'award')
      .eq('entity_type', 'award')
      .eq('entity_id', `${snap.year}-${String(snap.month).padStart(2, '0')}`);
    if (existing && existing > 0) continue;

    const isOverall = (uid: string) => snap.overall?.userId === uid;
    await createNotifications(
      [...winners.values()].map((w) => ({
        organizationId: org.id,
        recipientId: w.userId,
        type: 'award' as const,
        title: isOverall(w.userId)
          ? `🏆 Mitarbeiter des Monats – ${snap.monthLabel}!`
          : `✨ Auszeichnung im ${snap.monthLabel}`,
        body: isOverall(w.userId)
          ? `Herzlichen Glückwunsch! Du bist Mitarbeiter des Monats (${snap.overall?.value}).`
          : `Du wurdest im ${snap.monthLabel} ausgezeichnet. Stark!`,
        entityType: 'award',
        entityId: `${snap.year}-${String(snap.month).padStart(2, '0')}`,
      })),
    );
    notified += winners.size;
  }

  return { orgs: orgs.length, notified };
}
