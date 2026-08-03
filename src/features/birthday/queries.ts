import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { isBirthdayOn, monthDay } from '@/features/birthday/helpers';

export interface CalendarBirthday {
  id: string;
  date: string; // concrete YYYY-MM-DD within the queried range
  userName: string;
}

/**
 * Team birthdays that fall within [fromIso, toIso], for the calendar. Only the
 * day and month are exposed (never the birth year) and only for members who
 * did not opt out (show_birthday). Read via the service client because the
 * source table is otherwise private; the result carries no sensitive data.
 */
export async function listTeamBirthdays(
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<CalendarBirthday[]> {
  const service = createSupabaseServiceClient();
  const { data: rows } = await service
    .from('employee_hr_profiles')
    .select('user_id, date_of_birth')
    .eq('organization_id', orgId)
    .eq('show_birthday', true)
    .not('date_of_birth', 'is', null);
  if (!rows || rows.length === 0) return [];

  const nameById = new Map<string, string>();
  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name')
    .in('id', rows.map((r) => r.user_id));
  for (const p of profiles ?? []) nameById.set(p.id, p.full_name ?? '—');

  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIso.slice(0, 4));
  const out: CalendarBirthday[] = [];
  for (const r of rows) {
    const md = monthDay(r.date_of_birth);
    if (!md) continue;
    // The grid can straddle a year boundary (e.g. late Dec → early Jan), so
    // check each year the range touches.
    for (let y = fromYear; y <= toYear; y++) {
      const date = `${y}-${md}`;
      if (date >= fromIso && date <= toIso) {
        out.push({ id: `bday-${r.user_id}-${y}`, date, userName: nameById.get(r.user_id) ?? '—' });
      }
    }
  }
  return out;
}

/**
 * Whether it is the user's birthday today AND the once-per-year grant exists —
 * the gate for showing the Happy-Birthday badge and the festive title image in
 * the Level Hub. Tying it to the grant keeps badge/banner in lockstep with the
 * (non-farmable) yearly reward.
 */
export async function isBirthdayActive(userId: string): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const { data: hr } = await service
    .from('employee_hr_profiles')
    .select('date_of_birth')
    .eq('user_id', userId)
    .maybeSingle();
  if (!isBirthdayOn(hr?.date_of_birth, today)) return false;

  const { data: grant } = await service
    .from('birthday_grants')
    .select('user_id')
    .eq('user_id', userId)
    .eq('year', Number(today.slice(0, 4)))
    .maybeSingle();
  return Boolean(grant);
}
