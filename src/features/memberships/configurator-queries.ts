import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import {
  normalizeSelections,
  totalMonthlyCents,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';

type Membership = Database['public']['Tables']['client_memberships']['Row'];
// Accepts both the RLS server client and the service client (billing cron).
type Supabase = SupabaseClient<Database>;

/** Shape of the pending (scheduled) change stored in pending_modules. */
export interface PendingChange {
  selections: ModuleSelection[];
  netCents: number;
  name: string;
  stage: number;
}

export interface ConfiguratorView {
  hasMembership: boolean;
  clientCompanyId: string;
  /** Active selection + its net monthly total (what is billed now). */
  active: { selections: ModuleSelection[]; netCents: number; name: string; stage: number };
  /** Scheduled change effective next month, if any. */
  pending: (PendingChange & { effectiveDate: string }) | null;
  priceContext: PriceContext;
  clientCanEdit: boolean;
}

function parsePending(m: Membership): (PendingChange & { effectiveDate: string }) | null {
  if (!m.pending_modules || !m.pending_effective_date) return null;
  const p = m.pending_modules as Partial<PendingChange> | null;
  if (!p || !Array.isArray(p.selections)) return null;
  return {
    selections: normalizeSelections(p.selections),
    netCents: typeof p.netCents === 'number' ? p.netCents : 0,
    name: typeof p.name === 'string' ? p.name : 'Individuell',
    stage: typeof p.stage === 'number' ? p.stage : m.stage,
    effectiveDate: m.pending_effective_date,
  };
}

/**
 * Promotes a due scheduled change (pending_effective_date <= today) into the
 * active membership: the new modules/price become live and the pending slot is
 * cleared. Idempotent; returns the (possibly updated) membership. Called both
 * from the configurator view and the billing run so the next invoice already
 * uses the new price.
 */
export async function promoteIfDue(
  supabase: Supabase,
  membership: Membership,
): Promise<Membership> {
  const pending = parsePending(membership);
  if (!pending) return membership;
  const today = new Date().toISOString().slice(0, 10);
  if (pending.effectiveDate > today) return membership;

  const { data, error } = await supabase
    .from('client_memberships')
    .update({
      modules: pending.selections as unknown,
      custom_net_cents: pending.netCents,
      custom_name: pending.name,
      stage: pending.stage,
      pending_modules: null,
      pending_effective_date: null,
    })
    .eq('id', membership.id)
    .select('*')
    .maybeSingle();
  return (data as Membership) ?? (error ? membership : membership);
}

async function priceContextFor(
  supabase: Supabase,
  orgId: string,
): Promise<PriceContext> {
  const { data } = await supabase
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', orgId)
    .maybeSingle();
  return {
    stage1NetCents: data?.stage1_net_cents ?? 0,
    stage2NetCents: data?.stage2_net_cents ?? 0,
  };
}

/** Loads the configurator state for a client (promotes a due change first). */
export async function getMembershipConfigurator(
  clientCompanyId: string,
): Promise<ConfiguratorView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: raw } = await supabase
    .from('client_memberships')
    .select('*')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();

  if (!raw) {
    // No membership yet – configurator starts empty; org comes from the client.
    const { data: client } = await supabase
      .from('client_companies')
      .select('organization_id')
      .eq('id', clientCompanyId)
      .maybeSingle();
    const priceContext = client
      ? await priceContextFor(supabase, client.organization_id)
      : { stage1NetCents: 0, stage2NetCents: 0 };
    return {
      hasMembership: false,
      clientCompanyId,
      active: { selections: [], netCents: 0, name: 'Individuell', stage: 1 },
      pending: null,
      priceContext,
      clientCanEdit: false,
    };
  }

  const membership = await promoteIfDue(supabase, raw as Membership);
  const priceContext = await priceContextFor(supabase, membership.organization_id);
  const activeSelections = normalizeSelections(membership.modules);

  return {
    hasMembership: true,
    clientCompanyId,
    active: {
      selections: activeSelections,
      netCents:
        membership.custom_net_cents ??
        totalMonthlyCents(activeSelections, priceContext),
      name: membership.custom_name ?? 'Individuell',
      stage: membership.stage,
    },
    pending: parsePending(membership),
    priceContext,
    clientCanEdit: membership.client_can_edit ?? false,
  };
}
