import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { ActivityAction } from '@/lib/database.types';

export interface TaskActivityEntry {
  id: string;
  action: ActivityAction;
  actorName: string;
  column: string | null;
  createdAt: string;
}

export interface TaskViewStat {
  userId: string;
  name: string;
  lastSeen: string;
  views: number;
  dwellSeconds: number;
}

/**
 * The task's change log (created / moved / updated …). Read with the service
 * client because activity_log is otherwise admin-only; the caller (agency task
 * page) has already authorized access to the task. Never exposed to clients.
 */
export async function listTaskActivity(
  taskId: string,
  limit = 50,
): Promise<TaskActivityEntry[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('activity_log')
    .select('id, action, actor_id, metadata, created_at')
    .eq('entity_type', 'task')
    .eq('entity_id', taskId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return [];

  const actorIds = [
    ...new Set(data.map((r) => r.actor_id).filter((v): v is string => !!v)),
  ];
  const { data: profiles } = actorIds.length
    ? await service.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '—']));

  return data.map((r) => {
    const meta = (r.metadata ?? {}) as { column?: string };
    return {
      id: r.id,
      action: r.action,
      actorName: r.actor_id ? nameById.get(r.actor_id) ?? '—' : '—',
      column: typeof meta.column === 'string' && meta.column ? meta.column : null,
      createdAt: r.created_at,
    };
  });
}

/** Per-user view stats for a task: last seen, view count, total dwell time. */
export async function getTaskViewStats(taskId: string): Promise<TaskViewStat[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('task_views')
    .select('user_id, opened_at, dwell_seconds')
    .eq('task_id', taskId)
    .order('opened_at', { ascending: false })
    .limit(2000);
  if (!data || data.length === 0) return [];

  const byUser = new Map<string, { lastSeen: string; views: number; dwell: number }>();
  for (const v of data) {
    const cur = byUser.get(v.user_id);
    if (!cur) {
      byUser.set(v.user_id, {
        lastSeen: v.opened_at,
        views: 1,
        dwell: v.dwell_seconds ?? 0,
      });
    } else {
      cur.views += 1;
      cur.dwell += v.dwell_seconds ?? 0;
      if (v.opened_at > cur.lastSeen) cur.lastSeen = v.opened_at;
    }
  }

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name')
    .in('id', [...byUser.keys()]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '—']));

  return [...byUser.entries()]
    .map(([userId, s]) => ({
      userId,
      name: nameById.get(userId) ?? '—',
      lastSeen: s.lastSeen,
      views: s.views,
      dwellSeconds: s.dwell,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
