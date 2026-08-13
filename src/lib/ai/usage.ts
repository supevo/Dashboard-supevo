import 'server-only';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AiUsagePurpose = 'receipt' | 'bank' | 'text';

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Records one KI call's token usage – best effort, never throws (a failed log
 * must never break the actual extraction). Missing table (Migration 0123 not yet
 * run) is silently ignored.
 */
export async function recordAiUsage(
  supabase: Supabase,
  params: { orgId: string; purpose: AiUsagePurpose; usage: AiUsage },
): Promise<void> {
  try {
    const { error } = await supabase.from('ai_usage_events').insert({
      organization_id: params.orgId,
      model: params.usage.model,
      purpose: params.purpose,
      input_tokens: Math.max(0, Math.round(params.usage.inputTokens || 0)),
      output_tokens: Math.max(0, Math.round(params.usage.outputTokens || 0)),
    });
    if (error && error.code !== '42P01') {
      logger.warn('ai_usage.record_failed', { error: error.message });
    }
  } catch (e) {
    logger.warn('ai_usage.record_threw', { error: (e as Error).message });
  }
}

export interface AiUsageModelStat {
  model: string;
  tokens: number;
  calls: number;
}
export interface AiUsageSummary {
  available: boolean;
  today: AiUsageModelStat[];
  last30: AiUsageModelStat[];
}

/** Aggregates KI token usage for an org: per model, today and the last 30 days. */
export async function getAiUsageSummary(
  supabase: Supabase,
  orgId: string,
): Promise<AiUsageSummary> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('model, input_tokens, output_tokens, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(50000);
  if (error) return { available: false, today: [], last30: [] };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const agg = (rows: typeof data): AiUsageModelStat[] => {
    const byModel = new Map<string, { tokens: number; calls: number }>();
    for (const r of rows ?? []) {
      const e = byModel.get(r.model) ?? { tokens: 0, calls: 0 };
      e.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      e.calls += 1;
      byModel.set(r.model, e);
    }
    return [...byModel.entries()]
      .map(([model, v]) => ({ model, tokens: v.tokens, calls: v.calls }))
      .sort((a, b) => b.tokens - a.tokens);
  };

  const today = (data ?? []).filter(
    (r) => new Date(r.created_at).getTime() >= todayMs,
  );
  return { available: true, today: agg(today), last30: agg(data) };
}
