import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { getModuleCatalog } from '@/features/memberships/catalog-queries';
import {
  getActivePromotions,
  getPromotionsByIds,
  type Promotion,
} from '@/features/promotions/queries';
import {
  normalizeSelections,
  totalMonthlyCents,
  type ModuleDef,
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
  active: {
    selections: ModuleSelection[];
    netCents: number;
    name: string;
    stage: number;
    /** Gespeicherter Custom-Preis (netto) oder null, falls kein Override. */
    customNetCents: number | null;
  };
  /** Scheduled change effective next month, if any. */
  pending: (PendingChange & { effectiveDate: string }) | null;
  priceContext: PriceContext;
  clientCanEdit: boolean;
  modules: ModuleDef[];
  /** Regulärer MwSt-Satz der Org (für Brutto↔Netto im Custom-Preis-Feld). */
  taxRatePct: number;
  /** Aktive Aktionen/Gutscheine der Org (für den Baukasten). */
  promotions: Promotion[];
  /** Bereits eingelöste Aktionen (Promotion-IDs) dieser Mitgliedschaft. */
  redeemedPromotions: string[];
}

/** Liest die eingelösten Promotion-IDs robust aus einer Mitgliedschaft. */
function readRedeemed(m: { redeemed_promotions?: unknown } | null): string[] {
  const raw = m?.redeemed_promotions;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Aktive Promotions plus die eingelösten (auch inaktive/abgelaufene) – so kann
 * der Baukasten den Rabatt eines eingelösten Gutscheins immer anwenden, genau
 * wie die laufende Abrechnung. Deduped über die ID.
 */
async function promotionsForConfigurator(
  orgId: string,
  redeemedIds: string[],
): Promise<Promotion[]> {
  const active = await getActivePromotions(orgId);
  const missing = redeemedIds.filter((id) => !active.some((p) => p.id === id));
  if (missing.length === 0) return active;
  const extra = await getPromotionsByIds(orgId, missing);
  return [...active, ...extra];
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
): Promise<{ ctx: PriceContext; taxRatePct: number }> {
  const { data } = await supabase
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents, default_tax_rate')
    .eq('organization_id', orgId)
    .maybeSingle();
  return {
    ctx: {
      stage1NetCents: data?.stage1_net_cents ?? 0,
      stage2NetCents: data?.stage2_net_cents ?? 0,
    },
    taxRatePct: data?.default_tax_rate ?? 19,
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
    const pc = client
      ? await priceContextFor(supabase, client.organization_id)
      : { ctx: { stage1NetCents: 0, stage2NetCents: 0 }, taxRatePct: 19 };
    const modules = client ? await getModuleCatalog(client.organization_id) : [];
    const promotions = client
      ? await getActivePromotions(client.organization_id)
      : [];
    return {
      hasMembership: false,
      clientCompanyId,
      active: { selections: [], netCents: 0, name: 'Individuell', stage: 1, customNetCents: null },
      pending: null,
      priceContext: pc.ctx,
      clientCanEdit: false,
      modules,
      taxRatePct: pc.taxRatePct,
      promotions,
      redeemedPromotions: [],
    };
  }

  const membership = await promoteIfDue(supabase, raw as Membership);
  const pc = await priceContextFor(supabase, membership.organization_id);
  const priceContext = pc.ctx;
  const modules = await getModuleCatalog(membership.organization_id);
  const activeSelections = normalizeSelections(membership.modules);
  const redeemedPromotions = readRedeemed(membership);
  const promotions = await promotionsForConfigurator(
    membership.organization_id,
    redeemedPromotions,
  );

  return {
    hasMembership: true,
    clientCompanyId,
    active: {
      selections: activeSelections,
      netCents:
        membership.custom_net_cents ??
        totalMonthlyCents(modules, activeSelections, priceContext),
      name: membership.custom_name ?? 'Individuell',
      stage: membership.stage,
      customNetCents: membership.custom_net_cents ?? null,
    },
    pending: parsePending(membership),
    priceContext,
    clientCanEdit: membership.client_can_edit ?? false,
    modules,
    taxRatePct: pc.taxRatePct,
    promotions,
    redeemedPromotions,
  };
}
// (Promotions/Gutscheine werden bewusst nur im Lead-Angebot angezeigt.)

export interface PortalConfiguratorView extends ConfiguratorView {
  isLegacy: boolean;
  companyName: string | null;
}

/**
 * Portal view of the signed-in client's own membership configurator. RLS scopes
 * the membership to the caller. Only meaningful for LEGACY clients (they see the
 * modules); supevo clients keep the classic membership view elsewhere.
 */
export async function getPortalMembershipConfigurator(): Promise<PortalConfiguratorView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: raw } = await supabase
    .from('client_memberships')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (!raw) return null;

  const membership = await promoteIfDue(supabase, raw as Membership);
  const { data: company } = await supabase
    .from('client_companies')
    .select('name, is_legacy')
    .eq('id', membership.client_company_id)
    .maybeSingle();

  // Stage prices via service client (clients may not read billing_settings).
  let priceContext: PriceContext = { stage1NetCents: 0, stage2NetCents: 0 };
  try {
    const { data: s } = await createSupabaseServiceClient()
      .from('billing_settings')
      .select('stage1_net_cents, stage2_net_cents')
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (s) {
      priceContext = {
        stage1NetCents: s.stage1_net_cents,
        stage2NetCents: s.stage2_net_cents,
      };
    }
  } catch {
    // keep zeros
  }

  const modules = await getModuleCatalog(membership.organization_id);
  const activeSelections = normalizeSelections(membership.modules);
  return {
    hasMembership: true,
    clientCompanyId: membership.client_company_id,
    active: {
      selections: activeSelections,
      netCents:
        membership.custom_net_cents ??
        totalMonthlyCents(modules, activeSelections, priceContext),
      name: membership.custom_name ?? 'Individuell',
      stage: membership.stage,
      customNetCents: membership.custom_net_cents ?? null,
    },
    pending: parsePending(membership),
    priceContext,
    clientCanEdit: membership.client_can_edit ?? false,
    modules,
    taxRatePct: 19,
    // Gutscheine werden bewusst nur im Lead-Angebot und im Agentur-Baukasten
    // eingelöst; im Portal nur angezeigt (OfferCarryoverCard).
    promotions: [],
    redeemedPromotions: readRedeemed(membership),
    isLegacy: company?.is_legacy ?? false,
    companyName: company?.name ?? null,
  };
}

/**
 * Phase 3: informs the agency team that modules were deselected, so the running
 * measures for those modules can be ended. A hard auto-stop needs a module↔task
 * link (not modelled yet); this reliably surfaces the change instead.
 */
export async function notifyRemovedModules(params: {
  orgId: string;
  clientCompanyId: string;
  companyName: string | null;
  removedLabels: string[];
  effectiveDate: string;
  actorId?: string;
}): Promise<void> {
  if (params.removedLabels.length === 0) return;
  const service = createSupabaseServiceClient();
  const { data: admins } = await service
    .from('memberships')
    .select('user_id')
    .eq('organization_id', params.orgId)
    .in('role', ['agency_admin', 'super_admin'])
    .eq('status', 'active');
  const recipients = [
    ...new Set((admins ?? []).map((a) => a.user_id).filter((x): x is string => !!x)),
  ];
  if (recipients.length === 0) return;

  const labels = params.removedLabels.join(', ');
  await createNotifications(
    recipients.map((recipientId) => ({
      organizationId: params.orgId,
      recipientId,
      type: 'onboarding' as const,
      title: `Module abgewählt${params.companyName ? ` – ${params.companyName}` : ''}`,
      body: `Ab ${params.effectiveDate}: ${labels}. Laufende Maßnahmen bitte beenden.`,
      entityType: 'client_memberships',
      entityId: params.clientCompanyId,
    })),
    params.actorId,
  );
}
