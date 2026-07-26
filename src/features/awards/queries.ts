import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AwardWinner } from './engine';

export interface HallOfFameEntry {
  year: number;
  month: number;
  monthLabel: string;
  overall: AwardWinner;
}

/**
 * Reads the frozen award snapshots for the org's Hall of Fame (newest first).
 * RLS-scoped to agency staff. Only months with an overall winner are returned.
 */
export async function listHallOfFame(
  orgId: string,
  limit = 6,
): Promise<HallOfFameEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('award_snapshots')
    .select('year, month, month_label, overall')
    .eq('organization_id', orgId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(limit);

  return (data ?? [])
    .filter((s) => s.overall)
    .map((s) => ({
      year: s.year,
      month: s.month,
      monthLabel: s.month_label,
      overall: s.overall as unknown as AwardWinner,
    }));
}
