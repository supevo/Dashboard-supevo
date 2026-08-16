import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { rowToModuleDef, type ModuleDef } from '@/features/memberships/modules';

interface JoinedRow {
  key: string;
  label: string;
  description: string | null;
  pricing_kind: string;
  net_cents: number;
  unit_label: string | null;
  default_qty: number;
  min_qty: number;
  max_qty: number;
  stage: number | null;
  capture_budget: boolean;
  position: number;
  membership_module_categories: { name: string; position: number } | null;
}

function mapRows(rows: JoinedRow[] | null): ModuleDef[] {
  return (rows ?? []).map((r) =>
    rowToModuleDef({
      key: r.key,
      label: r.label,
      description: r.description,
      category_name: r.membership_module_categories?.name ?? null,
      category_position: r.membership_module_categories?.position ?? 0,
      pricing_kind: r.pricing_kind,
      net_cents: r.net_cents,
      unit_label: r.unit_label,
      default_qty: r.default_qty,
      min_qty: r.min_qty,
      max_qty: r.max_qty,
      stage: r.stage,
      capture_budget: r.capture_budget,
      position: r.position,
    }),
  );
}

const SELECT =
  'key, label, description, pricing_kind, net_cents, unit_label, default_qty, min_qty, max_qty, stage, capture_budget, position, membership_module_categories(name, position)';

/**
 * Active module catalog of an org (for the configurator). Uses the service
 * client so portal clients can read it too (the catalog is not sensitive; write
 * stays admin-only via RLS).
 */
export async function getModuleCatalog(orgId: string): Promise<ModuleDef[]> {
  const { data } = await createSupabaseServiceClient()
    .from('membership_modules')
    .select(SELECT)
    .eq('organization_id', orgId)
    .eq('active', true)
    .order('position', { ascending: true });
  return mapRows(data as JoinedRow[] | null);
}

export interface AdminCategory {
  id: string;
  name: string;
  position: number;
}
export interface AdminModule {
  id: string;
  categoryId: string | null;
  key: string;
  label: string;
  description: string;
  pricingKind: 'flat' | 'per_unit' | 'stage';
  netCents: number;
  unitLabel: string | null;
  defaultQty: number;
  minQty: number;
  maxQty: number;
  stage: number | null;
  captureBudget: boolean;
  position: number;
  active: boolean;
}
export interface AdminCatalog {
  categories: AdminCategory[];
  modules: AdminModule[];
}

/** Full catalog (incl. inactive) for the backend admin UI (RLS: org-admin). */
export async function getAdminCatalog(orgId: string): Promise<AdminCatalog> {
  const supabase = await createSupabaseServerClient();
  const [{ data: cats }, { data: mods }] = await Promise.all([
    supabase
      .from('membership_module_categories')
      .select('id, name, position')
      .eq('organization_id', orgId)
      .order('position', { ascending: true }),
    supabase
      .from('membership_modules')
      .select(
        'id, category_id, key, label, description, pricing_kind, net_cents, unit_label, default_qty, min_qty, max_qty, stage, capture_budget, position, active',
      )
      .eq('organization_id', orgId)
      .order('position', { ascending: true }),
  ]);
  return {
    categories: (cats ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
    })),
    modules: (mods ?? []).map((m) => ({
      id: m.id,
      categoryId: m.category_id,
      key: m.key,
      label: m.label,
      description: m.description ?? '',
      pricingKind: m.pricing_kind as 'flat' | 'per_unit' | 'stage',
      netCents: m.net_cents,
      unitLabel: m.unit_label,
      defaultQty: m.default_qty,
      minQty: m.min_qty,
      maxQty: m.max_qty,
      stage: m.stage,
      captureBudget: m.capture_budget,
      position: m.position,
      active: m.active,
    })),
  };
}
