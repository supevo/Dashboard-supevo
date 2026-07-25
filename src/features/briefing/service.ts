import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { logger } from '@/lib/logger';
import { isAiEnabled } from '@/lib/ai/complete';
import { gatherBriefingContext } from './context';
import { generateBriefing, type BriefingPriority } from './generate';

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
