import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';

export type PlanStatus = 'draft' | 'in_review' | 'accepted';
export type ItemStatus = 'proposed' | 'change_requested' | 'accepted' | 'embedded';

export interface PlanItem {
  id: string;
  month: number;
  title: string;
  description: string | null;
  status: ItemStatus;
  clientNote: string | null;
  taskId: string | null;
}

export interface MarketingPlan {
  id: string;
  clientCompanyId: string;
  organizationId: string;
  year: number;
  title: string;
  status: PlanStatus;
  items: PlanItem[];
}

function mapItems(rows: {
  id: string;
  month: number;
  title: string;
  description: string | null;
  status: string;
  client_note: string | null;
  task_id: string | null;
}[]): PlanItem[] {
  return rows
    .map((i) => ({
      id: i.id,
      month: i.month,
      title: i.title,
      description: i.description,
      status: i.status as ItemStatus,
      clientNote: i.client_note,
      taskId: i.task_id,
    }))
    .sort((a, b) => a.month - b.month);
}

/** Loads a client's marketing plan for a year (service client, agency-verified). */
export async function getPlan(
  clientCompanyId: string,
  year: number,
): Promise<MarketingPlan | null> {
  const service = createSupabaseServiceClient();
  const { data: plan } = await service
    .from('marketing_plans')
    .select('id, client_company_id, organization_id, year, title, status')
    .eq('client_company_id', clientCompanyId)
    .eq('year', year)
    .maybeSingle();
  if (!plan) return null;

  const { data: items } = await service
    .from('marketing_plan_items')
    .select('id, month, title, description, status, client_note, task_id')
    .eq('plan_id', plan.id);

  return {
    id: plan.id,
    clientCompanyId: plan.client_company_id,
    organizationId: plan.organization_id,
    year: plan.year,
    title: plan.title,
    status: plan.status as PlanStatus,
    items: mapItems(items ?? []),
  };
}

/** The current client's plan to review (only when released, i.e. not draft). */
export async function getMyPlan(): Promise<MarketingPlan | null> {
  const company = await getMyClientCompany();
  if (!company) return null;
  const service = createSupabaseServiceClient();
  const { data: plan } = await service
    .from('marketing_plans')
    .select('id, client_company_id, organization_id, year, title, status')
    .eq('client_company_id', company.clientCompanyId)
    .neq('status', 'draft')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const { data: items } = await service
    .from('marketing_plan_items')
    .select('id, month, title, description, status, client_note, task_id')
    .eq('plan_id', plan.id);

  return {
    id: plan.id,
    clientCompanyId: plan.client_company_id,
    organizationId: plan.organization_id,
    year: plan.year,
    title: plan.title,
    status: plan.status as PlanStatus,
    items: mapItems(items ?? []),
  };
}
