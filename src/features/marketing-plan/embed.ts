import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { autoEstimateTaskMinutes } from '@/features/estimate/generate';

type Service = ReturnType<typeof createSupabaseServiceClient>;

export interface QueueTarget {
  projectId: string;
  boardId: string;
  columnId: string;
}

/** Resolves the client's first project → first board → queue column. */
export async function resolveClientQueue(
  service: Service,
  clientCompanyId: string,
): Promise<QueueTarget | null> {
  const { data: project } = await service
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!project) return null;

  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', project.id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return null;

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return null;

  return { projectId: project.id, boardId: board.id, columnId: target.id };
}

export interface EmbeddableItem {
  id: string;
  month: number;
  title: string;
  description: string | null;
}

/**
 * Creates one kanban task per plan item in the client's queue column (due-dated
 * to the item's month) and marks each item 'embedded'. Returns the count.
 */
export async function embedItems(
  service: Service,
  ctx: {
    orgId: string;
    clientCompanyId: string;
    year: number;
    createdBy: string;
    target: QueueTarget;
  },
  items: EmbeddableItem[],
): Promise<number> {
  let basePos = Date.now();
  let count = 0;
  for (const item of items) {
    const due = `${ctx.year}-${String(item.month).padStart(2, '0')}-01`;
    const { data: task } = await service
      .from('tasks')
      .insert({
        organization_id: ctx.orgId,
        project_id: ctx.target.projectId,
        board_id: ctx.target.boardId,
        column_id: ctx.target.columnId,
        title: item.title,
        description: item.description ?? null,
        priority: 'medium',
        is_internal: false,
        due_date: due,
        created_by: ctx.createdBy,
        position: (basePos += 1000),
      })
      .select('id')
      .single();
    if (task) {
      await service
        .from('marketing_plan_items')
        .update({ status: 'embedded', task_id: task.id, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      await autoEstimateTaskMinutes(task.id, item.title, item.description ?? null);
      count += 1;
    }
  }
  return count;
}

/**
 * Auto-scheduler: for every ACCEPTED plan, embeds the items that are due
 * (month ≤ current month) and not yet embedded, into the client's board.
 * Idempotent (embedded items are skipped). Runs from a monthly cron so each
 * month's measures flow into the board automatically.
 */
export async function runPlanScheduler(): Promise<{ plans: number; tasks: number }> {
  const service = createSupabaseServiceClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: plans } = await service
    .from('marketing_plans')
    .select('id, organization_id, client_company_id, year, created_by')
    .eq('status', 'accepted')
    .eq('year', year);
  if (!plans || plans.length === 0) return { plans: 0, tasks: 0 };

  let planCount = 0;
  let taskCount = 0;
  for (const plan of plans) {
    const { data: items } = await service
      .from('marketing_plan_items')
      .select('id, month, title, description')
      .eq('plan_id', plan.id)
      .eq('status', 'accepted')
      .lte('month', month);
    if (!items || items.length === 0) continue;

    const target = await resolveClientQueue(service, plan.client_company_id);
    if (!target) continue;

    // tasks.created_by is NOT NULL: use the plan creator, else any org admin.
    let creator = plan.created_by;
    if (!creator) {
      const { data: admin } = await service
        .from('memberships')
        .select('user_id, role')
        .eq('organization_id', plan.organization_id)
        .eq('status', 'active')
        .in('role', ['agency_admin', 'super_admin'])
        .limit(1)
        .maybeSingle();
      creator = admin?.user_id ?? null;
    }
    if (!creator) continue;

    const embedded = await embedItems(
      service,
      {
        orgId: plan.organization_id,
        clientCompanyId: plan.client_company_id,
        year: plan.year,
        createdBy: creator,
        target,
      },
      items,
    );
    if (embedded > 0) {
      planCount += 1;
      taskCount += embedded;
    }
  }
  return { plans: planCount, tasks: taskCount };
}
