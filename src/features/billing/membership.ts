import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/database.types';
import type { BillingSettings } from '@/features/billing/queries';
import { promoDiscountCents, type PromoDiscount } from '@/features/promotions/discount';

export type ClientMembership =
  Database['public']['Tables']['client_memberships']['Row'];

/**
 * Anzeigename der Mitgliedschaft für Legacy-/Bestandskunden. Diese laufen intern
 * weiter über das Modul-Baukasten-Modell (`is_legacy`), werden aber überall, wo
 * ein Mensch sie sieht (Rechnung, Vertrag, Portal, Übersicht), als „supevo Smart"
 * geführt.
 */
export const SUPEVO_SMART_LABEL = 'supevo Smart';

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

/** Eingelöste Gutschein-IDs einer Mitgliedschaft (robust aus dem JSON gelesen). */
export function readRedeemedIds(
  membership: Pick<ClientMembership, 'redeemed_promotions'> | null,
): string[] {
  const raw = membership?.redeemed_promotions;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** Lädt die eingelösten Gutscheine als Rabatt-Regeln (Service-Client). */
async function redeemedPromoRules(
  orgId: string,
  ids: string[],
): Promise<PromoDiscount[]> {
  if (ids.length === 0) return [];
  // Bewusst OHNE active/valid_until-Filter: ein einmal eingelöster Gutschein
  // mindert die laufende Abrechnung weiter, auch wenn die Aktion später endet.
  const { data } = await createSupabaseServiceClient()
    .from('promotions')
    .select('id, discount_kind, discount_value')
    .eq('organization_id', orgId)
    .in('id', ids);
  return (data ?? []).map((p) => ({
    id: p.id,
    discountKind: (p.discount_kind ?? 'none') as PromoDiscount['discountKind'],
    discountValue: p.discount_value ?? 0,
  }));
}

type MembershipForPromo = Pick<
  ClientMembership,
  'organization_id' | 'stage' | 'custom_net_cents' | 'redeemed_promotions'
>;

/** Wiederkehrender Gutschein-Rabatt auf den Monatspreis (Cent). */
export async function membershipPromoDiscountCents(
  membership: MembershipForPromo | null,
  settings: Pick<BillingSettings, 'stage1_net_cents' | 'stage2_net_cents'> | null,
): Promise<number> {
  if (!membership) return 0;
  const ids = readRedeemedIds(membership);
  if (ids.length === 0) return 0;
  const base = effectiveMonthlyCents(membership, settings);
  const rules = await redeemedPromoRules(membership.organization_id, ids);
  return promoDiscountCents(base, rules, ids);
}

/**
 * Tatsächlich zu zahlender Netto-Monatspreis inkl. eingelöster Gutscheine – die
 * einzige Quelle der Wahrheit für Rechnung, Übersicht, Vertrag und Anzeige.
 */
export async function netMonthlyAfterPromos(
  membership: MembershipForPromo | null,
  settings: Pick<BillingSettings, 'stage1_net_cents' | 'stage2_net_cents'> | null,
): Promise<number> {
  const base = effectiveMonthlyCents(membership, settings);
  const discount = await membershipPromoDiscountCents(membership, settings);
  return Math.max(0, base - discount);
}

/** The plan label shown to the client: custom name or the stage package name.
 *  Legacy-/Bestandskunden werden einheitlich als „supevo Smart" geführt. */
export function membershipLabel(
  membership: Pick<ClientMembership, 'stage' | 'custom_name'> | null,
  settings: Pick<BillingSettings, 'stage1_name' | 'stage2_name'> | null,
  isLegacy = false,
): string {
  if (!membership) return '—';
  if (isLegacy) return SUPEVO_SMART_LABEL;
  if (membership.custom_name) return membership.custom_name;
  if (membership.stage === 2) return settings?.stage2_name ?? 'supevo Mitgliedschaft Stage 2';
  return settings?.stage1_name ?? 'supevo Mitgliedschaft Stage 1';
}
