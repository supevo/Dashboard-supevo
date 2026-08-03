import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { isBirthdayOn } from '@/features/birthday/helpers';
import { ensureBirthdayGrant } from '@/features/birthday/grant';

/**
 * Cron entry point: grant the birthday reward to everyone whose birthday is
 * today, so it happens even for people who don't open the app that day.
 * ensureBirthdayGrant is idempotent (once-per-year lock), so re-running the
 * cron — or a later hub visit by the same user — never double-grants.
 */
export async function runBirthdayScheduler(): Promise<{ granted: number }> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();

  const { data: rows } = await service
    .from('employee_hr_profiles')
    .select('user_id, organization_id, date_of_birth')
    .not('date_of_birth', 'is', null);

  let granted = 0;
  for (const r of rows ?? []) {
    if (!isBirthdayOn(r.date_of_birth, today)) continue;
    const res = await ensureBirthdayGrant(r.user_id, r.organization_id);
    if (res.newlyGranted) granted++;
  }
  return { granted };
}
