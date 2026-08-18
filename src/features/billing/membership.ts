import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import type { BillingSettings } from '@/features/billing/queries';

export type ClientMembership =
  Database['public']['Tables']['client_memberships']['Row'];

/** Loads a client's membership (RLS: agency org or the client itself). */
export async function getClientMembership(
  clientCompanyId: string,
): Promise<ClientMembership | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_memberships')
    .select('*')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return data ?? null;
}

/** The net monthly price that actually applies: custom override or stage price. */
export function effectiveMonthlyCents(
  membership: Pick<ClientMembership, 'stage' | 'custom_net_cents'> | null,
  settings: Pick<BillingSettings, 'stage1_net_cents' | 'stage2_net_cents'> | null,
): number {
  if (!membership) return 0;
  if (membership.custom_net_cents != null) return membership.custom_net_cents;
  if (membership.stage === 2) return settings?.stage2_net_cents ?? 0;
  return settings?.stage1_net_cents ?? 0;
}

/** The plan label shown to the client: custom name or the stage package name. */
export function membershipLabel(
  membership: Pick<ClientMembership, 'stage' | 'custom_name'> | null,
  settings: Pick<BillingSettings, 'stage1_name' | 'stage2_name'> | null,
): string {
  if (!membership) return '—';
  if (membership.custom_name) return membership.custom_name;
  if (membership.stage === 2) return settings?.stage2_name ?? 'supevo Mitgliedschaft Stage 2';
  return settings?.stage1_name ?? 'supevo Mitgliedschaft Stage 1';
}
