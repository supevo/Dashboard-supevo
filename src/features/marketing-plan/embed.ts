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
  title: string;
  description: string | null;
  /** Phase label, prepended to the task description for context. */
  phaseTitle: string | null;
}

const MARKETING_LABEL = 'Marketingplan';
const MARKETING_LABEL_COLOR = '#8b5cf6'; // violet

/**
 * Finds (or creates) the org's "Marketingplan" label, so embedded tasks are
 * clearly marked as plan work that the team processes automatically. Returns
 * null on failure (embedding then just skips the label).
 */
export async function ensureMarketingLabel(
  service: Service,
  orgId: string,
): Promise<string | null> {
  const { data: existing } = await service
    .from('labels')
    .select('id')
    .eq('organization_id', orgId)
    .ilike('name', MARKETING_LABEL)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await service
    .from('labels')
    .insert({
      organization_id: orgId,
      name: MARKETING_LABEL,
      color: MARKETING_LABEL_COLOR,
      is_client_visible: false,
    })
    .select('id')
    .maybeSingle();
  return created?.id ?? null;
}

/**
 * Creates one kanban task per plan measure in the client's queue column and
 * marks each item 'embedded'. No due date – the plan has no fixed timeframe;
 * the team schedules the work themselves. Returns the count.
 */
export async function embedItems(
  service: Service,
  ctx: {
    orgId: string;
    createdBy: string;
    target: QueueTarget;
    labelId?: string | null;
  },
  items: EmbeddableItem[],
): Promise<number> {
  let basePos = Date.now();
  let count = 0;
  for (const item of items) {
    const description = item.phaseTitle
      ? `${item.phaseTitle}${item.description ? `\n\n${item.description}` : ''}`
      : item.description ?? null;
    const { data: task } = await service
      .from('tasks')
      .insert({
        organization_id: ctx.orgId,
        project_id: ctx.target.projectId,
        board_id: ctx.target.boardId,
        column_id: ctx.target.columnId,
        title: item.title,
        description,
        priority: 'medium',
        is_internal: false,
        created_by: ctx.createdBy,
        position: (basePos += 1000),
      })
      .select('id')
      .single();
    if (task) {
      // Mark as marketing-plan work (auto-processed by the team).
      if (ctx.labelId) {
        await service.from('task_labels').insert({
          task_id: task.id,
          label_id: ctx.labelId,
          organization_id: ctx.orgId,
        });
      }
      await service
        .from('marketing_plan_items')
        .update({
          status: 'embedded',
          task_id: task.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      await autoEstimateTaskMinutes(task.id, item.title, description);
      count += 1;
    }
  }
  return count;
}

/**
 * Retired: plans are phase-based and have no fixed timeframe, so there is no
 * monthly auto-embed. Measures flow into the board manually via
 * "Ins Kanban übernehmen". Kept as a no-op so the existing cron endpoint stays
 * valid.
 */
export async function runPlanScheduler(): Promise<{
  plans: number;
  tasks: number;
}> {
  return { plans: 0, tasks: 0 };
}
