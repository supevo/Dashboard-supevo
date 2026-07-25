import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { logger } from '@/lib/logger';
import { advancePastToday } from './recurrence';

/**
 * Creates real tasks from all recurring templates that are due today, then
 * advances each template's next-run date past today. Runs via the service
 * client (bypasses RLS); invoked by the daily cron.
 */
export async function runDueRecurringTasks(): Promise<{ created: number }> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();

  const { data: due } = await service
    .from('recurring_tasks')
    .select('*')
    .eq('active', true)
    .lte('next_run_date', today);

  let created = 0;
  for (const t of due ?? []) {
    if (!t.created_by) {
      logger.warn('recurring.skip_no_creator', { id: t.id });
      continue;
    }

    const { data: col } = await service
      .from('board_columns')
      .select('board_id')
      .eq('id', t.column_id)
      .maybeSingle();
    if (!col) {
      logger.warn('recurring.skip_no_column', { id: t.id });
      continue;
    }

    const { data: maxRow } = await service
      .from('tasks')
      .select('position')
      .eq('column_id', t.column_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? 0) + 1000;

    const { error } = await service.from('tasks').insert({
      organization_id: t.organization_id,
      project_id: t.project_id,
      board_id: col.board_id,
      column_id: t.column_id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      is_internal: t.is_internal,
      created_by: t.created_by,
      position,
    });
    if (error) {
      logger.warn('recurring.insert_failed', { id: t.id, error: error.message });
      continue;
    }
    created++;

    const next = advancePastToday(
      t.frequency,
      t.weekday,
      t.day_of_month,
      t.next_run_date,
      today,
    );
    await service
      .from('recurring_tasks')
      .update({ next_run_date: next })
      .eq('id', t.id);
  }

  return { created };
}
