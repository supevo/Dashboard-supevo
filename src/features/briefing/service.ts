import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { logger } from '@/lib/logger';
import { isAiEnabled } from '@/lib/ai/complete';
import { gatherBriefingContext } from './context';
import { generateBriefing, type BriefingPriority } from './generate';
import { bumpCounter } from '@/features/gamification/actions';
import type { TaskStatus } from '@/features/tasks/components/task-status-control';

/**
 * Current Kanban status per task id, mapped onto the four standard columns
 * (queue/active/review/done). Tasks in custom columns are omitted. Used to seed
 * the status dropdown on the KI-Übersicht priorities.
 */
export async function currentTaskStatuses(
  taskIds: string[],
): Promise<Record<string, TaskStatus>> {
  if (taskIds.length === 0) return {};
  const service = createSupabaseServiceClient();
  const { data: tasks } = await service
    .from('tasks')
    .select('id, column_id')
    .in('id', taskIds);
  const columnIds = [...new Set((tasks ?? []).map((t) => t.column_id))];
  if (columnIds.length === 0) return {};
  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, is_done_column')
    .in('id', columnIds);
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [
      c.id,
      (c.is_done_column ? 'done' : c.column_key) as string,
    ]),
  );
  const out: Record<string, TaskStatus> = {};
  for (const t of tasks ?? []) {
    const key = keyByColumn.get(t.column_id);
    if (key === 'queue' || key === 'active' || key === 'review' || key === 'done')
      out[t.id] = key;
  }
  return out;
}

export interface StoredBriefing {
  summary: string;
  priorities: BriefingPriority[];
  nextMove: string | null;
  notes: string[];
  model: string | null;
  createdAt: string;
}

/** Reads today's cached briefing for the user, or null if none exists yet. */
export async function getTodayBriefing(
  userId: string,
): Promise<StoredBriefing | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('ai_briefings')
    .select('summary, priorities, next_move, notes, model, created_at')
    .eq('user_id', userId)
    .eq('briefing_date', berlinToday())
    .maybeSingle();
  if (!data) return null;
  return {
    summary: data.summary,
    priorities: data.priorities ?? [],
    nextMove: data.next_move,
    notes: data.notes ?? [],
    model: data.model,
    createdAt: data.created_at,
  };
}

/**
 * Generates today's briefing for the user and stores it (one row per day).
 * Returns the stored briefing, or null when AI is disabled or generation fails.
 */
export async function createTodayBriefing(
  userId: string,
): Promise<StoredBriefing | null> {
  if (!isAiEnabled()) return null;

  const ctx = await gatherBriefingContext(userId);
  const generated = await generateBriefing(ctx);
  if (!generated) return null;

  // Collectible badge "KI Buddy": count fresh AI summaries the user pulls.
  // In the cron pre-generation path there is no session, so this is a no-op.
  await bumpCounter('ai_summary');

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('ai_briefings')
    .upsert(
      {
        user_id: userId,
        briefing_date: ctx.today,
        summary: generated.summary,
        priorities: generated.priorities,
        next_move: generated.nextMove,
        notes: generated.notes,
        model: generated.model,
      },
      { onConflict: 'user_id,briefing_date' },
    )
    .select('summary, priorities, next_move, notes, model, created_at')
    .single();

  if (error || !data) {
    logger.error('briefing upsert failed', { error: error?.message });
    // Still return the generated result so the user sees it this request.
    return {
      summary: generated.summary,
      priorities: generated.priorities,
      nextMove: generated.nextMove,
      notes: generated.notes,
      model: generated.model,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    summary: data.summary,
    priorities: data.priorities ?? [],
    nextMove: data.next_move,
    notes: data.notes ?? [],
    model: data.model,
    createdAt: data.created_at,
  };
}

/** Returns today's briefing, generating and caching it on first request. */
export async function getOrCreateTodayBriefing(
  userId: string,
): Promise<StoredBriefing | null> {
  const existing = await getTodayBriefing(userId);
  if (existing) return existing;
  return createTodayBriefing(userId);
}
