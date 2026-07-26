import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface PersonScore {
  userId: string;
  name: string;
  hasAvatar: boolean;
  score: number;
  completed: number;
  avgStars: number | null;
  onTimeRate: number | null; // 0..100
  kudos: number; // received + given this month
}

export interface AwardWinner {
  userId: string;
  name: string;
  hasAvatar: boolean;
  value: string;
}

export interface Awards {
  monthLabel: string;
  rows: PersonScore[]; // sorted by score desc
  overall: AwardWinner | null;
  quality: AwardWinner | null;
  reliability: AwardWinner | null;
  team: AwardWinner | null;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const DEFAULT_EFFORT_MIN = 60;

function qualityFactor(avgStars: number | null): number {
  if (avgStars === null) return 1.0; // neutral when unrated
  return 0.5 + ((avgStars - 1) / 9) * 1.0; // 1★→0.5 … 10★→1.5
}

/**
 * Computes the weighted monthly award scores + category winners.
 * Score per task = Aufwand × Qualität × Effizienz × Termintreue × Rework.
 * Plus Kudos received this month. Service client (org-wide); agency-checked
 * by the caller.
 */
export async function computeAwards(
  orgId: string,
  year: number,
  month: number, // 1-12
): Promise<Awards> {
  const service = createSupabaseServiceClient();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  // Staff of the org.
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staffIds = [
    ...new Set(
      (memberships ?? [])
        .filter((m) => m.role !== 'client')
        .map((m) => m.user_id),
    ),
  ];
  const { data: profiles } = staffIds.length
    ? await service.from('profiles').select('id, full_name, avatar_url').in('id', staffIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
  const profById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  // Tasks completed this month (in a done column, entered this month).
  const { data: doneCols } = await service
    .from('board_columns')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_done_column', true);
  const doneColIds = (doneCols ?? []).map((c) => c.id);

  const { data: tasks } = doneColIds.length
    ? await service
        .from('tasks')
        .select('id, due_date, column_entered_at, estimated_minutes, reopen_count')
        .eq('organization_id', orgId)
        .in('column_id', doneColIds)
        .gte('column_entered_at', `${monthStart}T00:00:00`)
        .lt('column_entered_at', `${monthEnd}T00:00:00`)
        .limit(5000)
    : { data: [] as { id: string; due_date: string | null; column_entered_at: string; estimated_minutes: number | null; reopen_count: number }[] };
  const taskIds = (tasks ?? []).map((t) => t.id);
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t] as const));

  // Ratings (avg stars) per task.
  const { data: ratings } = taskIds.length
    ? await service.from('task_ratings').select('task_id, stars').in('task_id', taskIds)
    : { data: [] as { task_id: string; stars: number }[] };
  const ratingAgg = new Map<string, { sum: number; n: number }>();
  for (const r of ratings ?? []) {
    const a = ratingAgg.get(r.task_id) ?? { sum: 0, n: 0 };
    a.sum += r.stars;
    a.n += 1;
    ratingAgg.set(r.task_id, a);
  }
  const avgStarsFor = (taskId: string): number | null => {
    const a = ratingAgg.get(taskId);
    return a ? a.sum / a.n : null;
  };

  // Actual minutes per task (time entries).
  const { data: entries } = taskIds.length
    ? await service.from('time_entries').select('task_id, duration_minutes').in('task_id', taskIds)
    : { data: [] as { task_id: string | null; duration_minutes: number | null }[] };
  const actualByTask = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!e.task_id) continue;
    actualByTask.set(e.task_id, (actualByTask.get(e.task_id) ?? 0) + (e.duration_minutes ?? 0));
  }

  // Assignees per completed task.
  const { data: assignees } = taskIds.length
    ? await service.from('task_assignees').select('task_id, user_id').in('task_id', taskIds)
    : { data: [] as { task_id: string; user_id: string }[] };

  // Kudos this month (received + given).
  const { data: kudos } = await service
    .from('kudos')
    .select('from_user_id, to_user_id, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', `${monthStart}T00:00:00`)
    .lt('created_at', `${monthEnd}T00:00:00`);
  const kudosCount = new Map<string, number>();
  for (const k of kudos ?? []) {
    kudosCount.set(k.to_user_id, (kudosCount.get(k.to_user_id) ?? 0) + 1);
    kudosCount.set(k.from_user_id, (kudosCount.get(k.from_user_id) ?? 0) + 1);
  }

  // Aggregate per user.
  const agg = new Map<
    string,
    { score: number; completed: number; starSum: number; starN: number; dueN: number; onTimeN: number }
  >();
  const bump = (uid: string) => {
    let a = agg.get(uid);
    if (!a) {
      a = { score: 0, completed: 0, starSum: 0, starN: 0, dueN: 0, onTimeN: 0 };
      agg.set(uid, a);
    }
    return a;
  };

  for (const a of assignees ?? []) {
    const t = taskById.get(a.task_id);
    if (!t) continue;
    const rec = bump(a.user_id);
    rec.completed += 1;

    const effortHours = (t.estimated_minutes ?? DEFAULT_EFFORT_MIN) / 60;
    const avg = avgStarsFor(t.id);
    const quality = qualityFactor(avg);
    if (avg !== null) {
      rec.starSum += avg;
      rec.starN += 1;
    }

    const actual = actualByTask.get(t.id) ?? 0;
    let efficiency = 1.0;
    if (actual > 0 && t.estimated_minutes) {
      const ratio = actual / t.estimated_minutes;
      efficiency = ratio <= 1 ? 1.2 : ratio <= 1.5 ? 1.0 : 0.9;
    }

    let ontime = 1.0;
    if (t.due_date) {
      rec.dueN += 1;
      const completedDate = t.column_entered_at.slice(0, 10);
      if (completedDate <= t.due_date) {
        ontime = 1.1;
        rec.onTimeN += 1;
      } else {
        ontime = 0.9;
      }
    }

    const rework = Math.max(0.5, 1 - t.reopen_count * 0.15);
    rec.score += effortHours * quality * efficiency * ontime * rework;
  }

  const rows: PersonScore[] = staffIds
    .map((uid) => {
      const a = agg.get(uid);
      const p = profById.get(uid);
      const kud = kudosCount.get(uid) ?? 0;
      return {
        userId: uid,
        name: p?.full_name ?? '—',
        hasAvatar: Boolean(p?.avatar_url),
        score: a ? Math.round(a.score * 10) / 10 : 0,
        completed: a?.completed ?? 0,
        avgStars: a && a.starN ? Math.round((a.starSum / a.starN) * 10) / 10 : null,
        onTimeRate: a && a.dueN ? Math.round((a.onTimeN / a.dueN) * 100) : null,
        kudos: kud,
      };
    })
    .filter((r) => r.score > 0 || r.completed > 0 || r.kudos > 0)
    .sort((x, y) => y.score - x.score);

  const winnerBy = (
    pick: (r: PersonScore) => number | null,
    fmt: (r: PersonScore) => string,
  ): AwardWinner | null => {
    let best: PersonScore | null = null;
    let bestVal = -Infinity;
    for (const r of rows) {
      const v = pick(r);
      if (v === null) continue;
      if (v > bestVal) {
        bestVal = v;
        best = r;
      }
    }
    return best && bestVal > 0
      ? { userId: best.userId, name: best.name, hasAvatar: best.hasAvatar, value: fmt(best) }
      : null;
  };

  return {
    monthLabel: `${MONTHS[month - 1]} ${year}`,
    rows,
    overall: winnerBy((r) => r.score, (r) => `${r.score} Pkt`),
    quality: winnerBy((r) => r.avgStars, (r) => `${r.avgStars}/10 ★`),
    reliability: winnerBy((r) => r.onTimeRate, (r) => `${r.onTimeRate}% pünktlich`),
    team: winnerBy((r) => r.kudos, (r) => `${r.kudos} Kudos`),
  };
}
