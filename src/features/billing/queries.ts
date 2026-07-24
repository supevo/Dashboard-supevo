import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BillingSettings =
  Database['public']['Tables']['billing_settings']['Row'];

/** Loads the organization's billing settings (RLS: org admins only). */
export async function getBillingSettings(
  orgId: string,
): Promise<BillingSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('billing_settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();
  return data ?? null;
}
