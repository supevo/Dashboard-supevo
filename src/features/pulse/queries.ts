import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { weekStartOf, weekStartBefore } from './week';

export interface MyPulse {
  mood: number;
  comment: string | null;
}

/** The current user's pulse for this week, if already submitted. */
export async function getMyPulse(userId: string): Promise<MyPulse | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('pulse_checks')
    .select('mood, comment')
    .eq('user_id', userId)
    .eq('week_start', weekStartOf())
    .maybeSingle();
  return data ? { mood: data.mood, comment: data.comment } : null;
}

export interface PulseWeek {
  weekStart: string;
  count: number;
  avg: number | null;
  good: number;
  ok: number;
  bad: number;
}

export interface PulseSummary {
  current: PulseWeek;
  trend: PulseWeek[]; // last ~8 weeks, oldest first
  comments: string[]; // anonymous, current week
}

function summarizeWeek(
  weekStart: string,
  rows: { mood: number }[],
): PulseWeek {
  const count = rows.length;
  const good = rows.filter((r) => r.mood === 3).length;
  const ok = rows.filter((r) => r.mood === 2).length;
  const bad = rows.filter((r) => r.mood === 1).length;
  const avg = count ? rows.reduce((n, r) => n + r.mood, 0) / count : null;
  return { weekStart, count, avg, good, ok, bad };
}

/**
 * Aggregated, ANONYMOUS pulse summary for leadership. Uses the service client
 * so no individual entry (and no name) is exposed — only counts + comments.
 */
export async function getPulseSummary(orgId: string): Promise<PulseSummary> {
  const service = createSupabaseServiceClient();
  const from = weekStartBefore(7);
  const { data } = await service
    .from('pulse_checks')
    .select('week_start, mood, comment')
    .eq('organization_id', orgId)
    .gte('week_start', from);

  const byWeek = new Map<string, { mood: number }[]>();
  for (const r of data ?? []) {
    const list = byWeek.get(r.week_start) ?? [];
    list.push({ mood: r.mood });
    byWeek.set(r.week_start, list);
  }

  const trend: PulseWeek[] = [];
  for (let i = 7; i >= 0; i--) {
    const wk = weekStartBefore(i);
    trend.push(summarizeWeek(wk, byWeek.get(wk) ?? []));
  }

  const thisWeek = weekStartOf();
  const comments = (data ?? [])
    .filter((r) => r.week_start === thisWeek && r.comment && r.comment.trim())
    .map((r) => r.comment as string);

  return {
    current: summarizeWeek(thisWeek, byWeek.get(thisWeek) ?? []),
    trend,
    comments,
  };
}
