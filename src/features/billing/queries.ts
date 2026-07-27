import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BillingSettings =
  Database['public']['Tables']['billing_settings']['Row'];

export type BillingEntity =
  Database['public']['Tables']['billing_entities']['Row'];

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

/** All billing entities (Rechnungssteller) of an org, default first. */
export async function listBillingEntities(
  orgId: string,
): Promise<BillingEntity[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('billing_entities')
    .select('*')
    .eq('organization_id', orgId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });
  return data ?? [];
}

/** Loads a single billing entity by id (RLS: org admins only). */
export async function getBillingEntityById(
  id: string,
): Promise<BillingEntity | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('billing_entities')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

/** The org's default billing entity, if one exists. */
export async function getDefaultBillingEntity(
  orgId: string,
): Promise<BillingEntity | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('billing_entities')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_default', true)
    .maybeSingle();
  return data ?? null;
}

/** Resolves the entity that bills a given client (assigned else default). */
export async function getBillingEntityForClient(
  orgId: string,
  clientCompanyId: string,
): Promise<BillingEntity | null> {
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from('client_companies')
    .select('billing_entity_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (client?.billing_entity_id) {
    const { data } = await supabase
      .from('billing_entities')
      .select('*')
      .eq('id', client.billing_entity_id)
      .maybeSingle();
    if (data) return data;
  }
  return getDefaultBillingEntity(orgId);
}
