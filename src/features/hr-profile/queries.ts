import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type HrProfile =
  Database['public']['Tables']['employee_hr_profiles']['Row'];

/**
 * The current user's own HR/payroll profile, or null if not filled in yet.
 * RLS restricts the read to the owner (and org admins), so this is safe.
 */
export async function getMyHrProfile(userId: string): Promise<HrProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('employee_hr_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}
