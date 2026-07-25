import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type AbsenceType = 'urlaub' | 'krank' | 'sonstiges';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

export interface Absence {
  id: string;
  userId: string;
  userName: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  note: string | null;
  status: AbsenceStatus;
  decisionComment: string | null;
}

interface AbsenceRow {
  id: string;
  user_id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  note: string | null;
  status: AbsenceStatus;
  decision_comment: string | null;
}

async function withNames(rows: AbsenceRow[]): Promise<Absence[]> {
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const service = createSupabaseServiceClient();
  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: nameById.get(r.user_id) ?? '—',
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    note: r.note,
    status: r.status,
    decisionComment: r.decision_comment,
  }));
}

const SELECT =
  'id, user_id, type, start_date, end_date, note, status, decision_comment';

/** The current user's own absence requests (newest first). */
export async function listMyAbsences(userId: string): Promise<Absence[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('absences')
    .select(SELECT)
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(50);
  return withNames((data ?? []) as AbsenceRow[]);
}

/** Upcoming/ongoing approved absences across the team (for planning). */
export async function listTeamAbsences(): Promise<Absence[]> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('absences')
    .select(SELECT)
    .eq('status', 'approved')
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .limit(100);
  return withNames((data ?? []) as AbsenceRow[]);
}

/** All pending requests in the org (for admins to decide). */
export async function listPendingAbsences(): Promise<Absence[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('absences')
    .select(SELECT)
    .eq('status', 'pending')
    .order('start_date', { ascending: true })
    .limit(100);
  return withNames((data ?? []) as AbsenceRow[]);
}
