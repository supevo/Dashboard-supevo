import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CeoTask, CeoStatus, CeoEnergy } from './types';

function map(r: {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  quadrant: number | null;
  energy: string | null;
  area: string | null;
  estimate_min: number | null;
  due_date: string | null;
  position: number;
  done_at: string | null;
  created_at: string;
}): CeoTask {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status as CeoStatus,
    quadrant: r.quadrant,
    energy: (r.energy as CeoEnergy | null) ?? null,
    area: r.area,
    estimateMin: r.estimate_min,
    dueDate: r.due_date,
    position: r.position,
    doneAt: r.done_at,
    createdAt: r.created_at,
  };
}

/**
 * Alle GF-Karten des angemeldeten Nutzers. Offene Karten vollständig, erledigte
 * nur die der letzten 14 Tage (das Board bleibt schlank). RLS scoped auf den
 * Aufrufer. Sortierung: innerhalb der Spalte nach `position` aufsteigend.
 */
export async function listCeoTasks(): Promise<CeoTask[]> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('ceo_tasks')
    .select(
      'id, title, notes, status, quadrant, energy, area, estimate_min, due_date, position, done_at, created_at',
    )
    .or(`status.neq.done,done_at.gte.${since}`)
    .order('position', { ascending: true })
    .limit(500);
  return (data ?? []).map(map);
}
