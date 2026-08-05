import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { type LegacyPackage, isLegacyPackage } from './packages';

export interface LegacySettings {
  clientCompanyId: string;
  package: LegacyPackage;
  /** Frei eingetragener Nettopreis in Cent, oder null (= Paket-Standardpreis). */
  customPriceCents: number | null;
  googleAdsBudgetCents: number | null;
  metaBudgetCents: number | null;
  notes: string | null;
}

/** Loads the legacy package settings for a client, or null if none saved yet. */
export async function getLegacySettings(
  clientCompanyId: string,
): Promise<LegacySettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('legacy_client_settings')
    .select(
      'client_company_id, package, custom_price_cents, google_ads_budget_cents, meta_budget_cents, notes',
    )
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();

  if (!data) return null;
  return {
    clientCompanyId: data.client_company_id,
    package: isLegacyPackage(data.package) ? data.package : 'care',
    customPriceCents: data.custom_price_cents,
    googleAdsBudgetCents: data.google_ads_budget_cents,
    metaBudgetCents: data.meta_budget_cents,
    notes: data.notes,
  };
}

/**
 * Maps each legacy client-company id in the org to its chosen package. Used to
 * split the projects overview into normal vs. legacy sections and to label the
 * (smaller) legacy project cards.
 */
export async function getLegacyClientPackages(
  orgId: string,
): Promise<Map<string, LegacyPackage>> {
  const supabase = await createSupabaseServerClient();
  const { data: legacy } = await supabase
    .from('client_companies')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_legacy', true)
    .is('deleted_at', null);

  const ids = (legacy ?? []).map((c) => c.id);
  const result = new Map<string, LegacyPackage>();
  if (ids.length === 0) return result;

  // Default every legacy client to 'care' until settings say otherwise.
  for (const id of ids) result.set(id, 'care');

  const { data: settings } = await supabase
    .from('legacy_client_settings')
    .select('client_company_id, package')
    .in('client_company_id', ids);
  for (const s of settings ?? []) {
    result.set(s.client_company_id, isLegacyPackage(s.package) ? s.package : 'care');
  }
  return result;
}
