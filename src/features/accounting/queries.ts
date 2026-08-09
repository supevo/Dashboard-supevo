import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import type { BillingEntity } from '@/features/billing/queries';

export type AccountingProfile =
  Database['public']['Tables']['accounting_profiles']['Row'];

/** One accounting company: a billing entity + its accounting profile + coupling. */
export interface AccountingCompany {
  entity: BillingEntity;
  profile: AccountingProfile | null;
  /** Kunden, die diesem Rechnungssteller zugeordnet sind. */
  clientCount: number;
  /** Rechnungen (Ausgang), die auf diese Firma laufen. */
  invoiceCount: number;
}

/** The accounting profile for one billing entity, if it exists. */
export async function getAccountingProfile(
  billingEntityId: string,
): Promise<AccountingProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('accounting_profiles')
    .select('*')
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();
  return data ?? null;
}

/**
 * All billing entities of the org as accounting companies (default first),
 * each enriched with its profile and how it couples to the existing finance
 * data (assigned clients + issued invoices).
 */
export async function listAccountingCompanies(
  orgId: string,
): Promise<AccountingCompany[]> {
  const supabase = await createSupabaseServerClient();

  const { data: entities } = await supabase
    .from('billing_entities')
    .select('*')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (!entities || entities.length === 0) return [];

  const { data: profiles } = await supabase
    .from('accounting_profiles')
    .select('*')
    .eq('organization_id', orgId);
  const profileByEntity = new Map(
    (profiles ?? []).map((p) => [p.billing_entity_id, p]),
  );

  const companies: AccountingCompany[] = [];
  for (const entity of entities) {
    const [{ count: clientCount }, { count: invoiceCount }] = await Promise.all([
      supabase
        .from('client_companies')
        .select('id', { count: 'exact', head: true })
        .eq('billing_entity_id', entity.id),
      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('billing_entity_id', entity.id),
    ]);
    companies.push({
      entity,
      profile: profileByEntity.get(entity.id) ?? null,
      clientCount: clientCount ?? 0,
      invoiceCount: invoiceCount ?? 0,
    });
  }
  return companies;
}
