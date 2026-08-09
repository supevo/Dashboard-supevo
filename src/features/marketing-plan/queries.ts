import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';

export type PlanStatus = 'draft' | 'in_review' | 'accepted';
export type ItemStatus = 'proposed' | 'change_requested' | 'accepted' | 'embedded';

export interface PlanItem {
  id: string;
  phaseId: string | null;
  title: string;
  description: string | null;
  status: ItemStatus;
  clientNote: string | null;
  taskId: string | null;
}

export interface PlanPhase {
  id: string;
  title: string;
  timeframeHint: string | null;
  outcome: string | null;
  items: PlanItem[];
}

export interface MarketingPlan {
  id: string;
  clientCompanyId: string;
  organizationId: string;
  title: string;
  status: PlanStatus;
  closingNote: string | null;
  phases: PlanPhase[];
  /** Flat list of all measures across phases (convenience for callers). */
  items: PlanItem[];
}

type ItemRow = {
  id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  status: string;
  client_note: string | null;
  task_id: string | null;
  position: number;
};

function mapItem(i: ItemRow): PlanItem {
  return {
    id: i.id,
    phaseId: i.phase_id,
    title: i.title,
    description: i.description,
    status: i.status as ItemStatus,
    clientNote: i.client_note,
    taskId: i.task_id,
  };
}

type Service = ReturnType<typeof createSupabaseServiceClient>;

/** Assembles a plan (phases + their measures) from a plan row. */
async function assemble(
  service: Service,
  plan: {
    id: string;
    client_company_id: string;
    organization_id: string;
    title: string;
    status: string;
    closing_note: string | null;
  },
): Promise<MarketingPlan> {
  const [{ data: phases }, { data: items }] = await Promise.all([
    service
      .from('marketing_plan_phases')
      .select('id, title, timeframe_hint, outcome, position')
      .eq('plan_id', plan.id)
      .order('position', { ascending: true }),
    service
      .from('marketing_plan_items')
      .select(
        'id, phase_id, title, description, status, client_note, task_id, position',
      )
      .eq('plan_id', plan.id)
      .order('position', { ascending: true }),
  ]);

  const allItems = (items ?? []).map(mapItem);
  const byPhase = new Map<string, PlanItem[]>();
  for (const it of allItems) {
    if (!it.phaseId) continue;
    byPhase.set(it.phaseId, [...(byPhase.get(it.phaseId) ?? []), it]);
  }

  return {
    id: plan.id,
    clientCompanyId: plan.client_company_id,
    organizationId: plan.organization_id,
    title: plan.title,
    status: plan.status as PlanStatus,
    closingNote: plan.closing_note,
    phases: (phases ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      timeframeHint: p.timeframe_hint,
      outcome: p.outcome,
      items: byPhase.get(p.id) ?? [],
    })),
    items: allItems,
  };
}

const PLAN_COLS =
  'id, client_company_id, organization_id, title, status, closing_note';

/** Loads a client's marketing plan (one per client). Agency-verified caller. */
export async function getPlan(
  clientCompanyId: string,
): Promise<MarketingPlan | null> {
  const service = createSupabaseServiceClient();
  const { data: plan, error } = await service
    .from('marketing_plans')
    .select(PLAN_COLS)
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[marketing-plan] getPlan failed', {
      code: error.code,
      message: error.message,
    });
  }
  if (!plan) return null;
  return assemble(service, plan);
}

/**
 * Whether the current client has a marketing plan worth showing (any non-draft
 * plan). Used to hide the Marketingplan nav item when none is deposited.
 */
export async function hasMyMarketingPlan(): Promise<boolean> {
  const company = await getMyClientCompany();
  if (!company) return false;
  const service = createSupabaseServiceClient();
  const { count } = await service
    .from('marketing_plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_company_id', company.clientCompanyId)
    .neq('status', 'draft');
  return (count ?? 0) > 0;
}

/** The current client's plan to review (only when released, i.e. not draft). */
export async function getMyPlan(): Promise<MarketingPlan | null> {
  const company = await getMyClientCompany();
  if (!company) return null;
  const service = createSupabaseServiceClient();
  const { data: plan } = await service
    .from('marketing_plans')
    .select(PLAN_COLS)
    .eq('client_company_id', company.clientCompanyId)
    .neq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;
  return assemble(service, plan);
}
