import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface OpenChore {
  /** assignment id */
  id: string;
  text: string;
}

export interface VerificationItem {
  /** assignment id */
  id: string;
  text: string;
  assigneeName: string;
  doneAt: string;
}

export interface AdminChore {
  id: string;
  text: string;
  active: boolean;
}

type Service = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Assigns one office chore to a user on clock-out – fairly: the active chore the
 * user has been given least often (ties broken at random). A random other active
 * colleague is drawn as the verifier (null when the user is alone). Best-effort
 * and idempotent-ish: skips when the user already has an open chore, and is a
 * no-op when the tables are missing (migration 0113 not applied) or there are no
 * active chores.
 */
export async function assignClockOutChore(args: {
  orgId: string;
  userId: string;
  workSessionId: string | null;
}): Promise<void> {
  const { orgId, userId, workSessionId } = args;
  const service = createSupabaseServiceClient();

  // Don't stack chores: if one is still open for this user, leave it.
  const { data: existing, error: exErr } = await service
    .from('office_chore_assignments')
    .select('id')
    .eq('assignee_id', userId)
    .eq('status', 'assigned')
    .limit(1);
  if (exErr) return; // table missing → feature not set up yet
  if ((existing ?? []).length > 0) return;

  const { data: chores, error: chErr } = await service
    .from('office_chores')
    .select('id')
    .eq('organization_id', orgId)
    .eq('active', true);
  if (chErr) return;
  const choreIds = (chores ?? []).map((c) => (c as { id: string }).id);
  if (choreIds.length === 0) return;

  // Fairness: pick the chore this user has had least often.
  const { data: past } = await service
    .from('office_chore_assignments')
    .select('chore_id')
    .eq('assignee_id', userId)
    .in('chore_id', choreIds);
  const count = new Map<string, number>();
  for (const id of choreIds) count.set(id, 0);
  for (const r of past ?? []) {
    const cid = (r as { chore_id: string }).chore_id;
    count.set(cid, (count.get(cid) ?? 0) + 1);
  }
  const min = Math.min(...choreIds.map((id) => count.get(id) ?? 0));
  const leastUsed = choreIds.filter((id) => (count.get(id) ?? 0) === min);
  const choreId = leastUsed[Math.floor(Math.random() * leastUsed.length)]!;

  // Verifier: a random other active staff member (not the doer, not clients).
  const { data: members } = await service
    .from('memberships')
    .select('user_id, role, status')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const others = (members ?? [])
    .filter(
      (m) =>
        (m as { role: string }).role !== 'client' &&
        (m as { user_id: string }).user_id !== userId,
    )
    .map((m) => (m as { user_id: string }).user_id);
  const verifierId = others.length
    ? others[Math.floor(Math.random() * others.length)]!
    : null;

  await service.from('office_chore_assignments').insert({
    organization_id: orgId,
    chore_id: choreId,
    assignee_id: userId,
    verifier_id: verifierId,
    status: 'assigned',
    work_session_id: workSessionId,
  } as never);
}

/** The current user's open (assigned, not yet done) chores. */
export async function listMyOpenChores(userId: string): Promise<OpenChore[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('office_chore_assignments')
    .select('id, chore_id')
    .eq('assignee_id', userId)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as unknown as { id: string; chore_id: string }[];
  if (rows.length === 0) return [];
  const { data: chores } = await service
    .from('office_chores')
    .select('id, text')
    .in('id', rows.map((r) => r.chore_id));
  const textById = new Map(
    ((chores ?? []) as unknown as { id: string; text: string }[]).map((c) => [
      c.id,
      c.text,
    ]),
  );
  return rows.map((r) => ({ id: r.id, text: textById.get(r.chore_id) ?? '—' }));
}

/** Chores waiting for the current user's double-check (status 'done'). */
export async function listMyVerifications(
  userId: string,
): Promise<VerificationItem[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('office_chore_assignments')
    .select('id, chore_id, assignee_id, done_at')
    .eq('verifier_id', userId)
    .eq('status', 'done')
    .order('done_at', { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as unknown as {
    id: string;
    chore_id: string;
    assignee_id: string;
    done_at: string | null;
  }[];
  if (rows.length === 0) return [];

  const [choresRes, profilesRes] = await Promise.all([
    service.from('office_chores').select('id, text').in('id', rows.map((r) => r.chore_id)),
    service.from('profiles').select('id, full_name').in('id', rows.map((r) => r.assignee_id)),
  ]);
  const textById = new Map(
    ((choresRes.data ?? []) as unknown as { id: string; text: string }[]).map(
      (c) => [c.id, c.text],
    ),
  );
  const nameById = new Map(
    (
      (profilesRes.data ?? []) as unknown as {
        id: string;
        full_name: string | null;
      }[]
    ).map((p) => [p.id, p.full_name ?? '—']),
  );
  return rows.map((r) => ({
    id: r.id,
    text: textById.get(r.chore_id) ?? '—',
    assigneeName: nameById.get(r.assignee_id) ?? '—',
    doneAt: r.done_at ?? '',
  }));
}

/** All chores of an org for the admin editor (active + inactive). */
export async function listOrgChores(orgId: string): Promise<AdminChore[]> {
  const service: Service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('office_chores')
    .select('id, text, active')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as {
    id: string;
    text: string;
    active: boolean;
  }[]).map((c) => ({ id: c.id, text: c.text, active: c.active }));
}
