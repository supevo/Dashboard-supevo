import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday, berlinWeekday } from '@/lib/time';
import type { NotificationType } from '@/lib/database.types';

export type ChoreFrequency = 'daily' | 'weekly' | 'monthly';
export type ChoreKind = 'personal' | 'shared';

/** Periodenschlüssel je Häufigkeit (einmal je Tag/Woche/Monat). */
export function chorePeriodKey(
  frequency: string,
  now: Date = new Date(),
): string {
  const today = berlinToday(now); // YYYY-MM-DD
  if (frequency === 'monthly') return today.slice(0, 7); // YYYY-MM
  if (frequency === 'weekly') {
    const wd = berlinWeekday(now); // Mon=1 … Sun=7
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (wd - 1)); // Montag der Woche
    return `W${d.toISOString().slice(0, 10)}`;
  }
  return today; // daily
}

export interface OpenChore {
  /** assignment id */
  id: string;
  text: string;
  /** true = nachzuholen (verpasst), gibt keine XP mehr. */
  makeup: boolean;
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
  kind: ChoreKind;
  frequency: ChoreFrequency;
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
export async function assignClockOutChores(args: {
  orgId: string;
  userId: string;
  workSessionId: string | null;
}): Promise<void> {
  const { orgId, userId, workSessionId } = args;
  const service = createSupabaseServiceClient();

  const { data: chores, error: chErr } = await service
    .from('office_chores')
    .select('id, kind, frequency')
    .eq('organization_id', orgId)
    .eq('active', true);
  if (chErr) return; // table missing → feature not set up yet
  const rows = (chores ?? []) as unknown as {
    id: string;
    kind: string | null;
    frequency: string | null;
  }[];
  if (rows.length === 0) return;

  // Aktive Kolleg:innen als mögliche Prüfer (nicht der Erlediger, keine Kunden).
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
  const pickVerifier = () =>
    others.length ? others[Math.floor(Math.random() * others.length)]! : null;

  for (const chore of rows) {
    const frequency = chore.frequency ?? 'daily';
    const kind = chore.kind ?? 'shared';
    const period = chorePeriodKey(frequency);

    if (kind === 'personal') {
      // Jeder hat seine eigene Instanz je Periode – nur anlegen, wenn dieser
      // Nutzer für diese Periode noch keine hat.
      const { data: mine } = await service
        .from('office_chore_assignments')
        .select('id')
        .eq('chore_id', chore.id)
        .eq('assignee_id', userId)
        .eq('period_key', period)
        .limit(1);
      if ((mine ?? []).length > 0) continue;
    } else {
      // Geteilt: einer je Periode – anlegen, wenn für diese Periode noch NIEMAND
      // zugeteilt ist (wer zuerst ausstempelt, bekommt sie).
      const { data: any } = await service
        .from('office_chore_assignments')
        .select('id')
        .eq('chore_id', chore.id)
        .eq('period_key', period)
        .limit(1);
      if ((any ?? []).length > 0) continue;
    }

    await service.from('office_chore_assignments').insert({
      organization_id: orgId,
      chore_id: chore.id,
      assignee_id: userId,
      verifier_id: pickVerifier(),
      status: 'assigned',
      period_key: period,
      work_session_id: workSessionId,
    } as never);
  }
}

/** The current user's open chores: still assigned + missed (to make up, no XP). */
export async function listMyOpenChores(userId: string): Promise<OpenChore[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('office_chore_assignments')
    .select('id, chore_id, status')
    .eq('assignee_id', userId)
    .in('status', ['assigned', 'missed'])
    .order('created_at', { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as unknown as {
    id: string;
    chore_id: string;
    status: string;
  }[];
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
  return rows.map((r) => ({
    id: r.id,
    text: textById.get(r.chore_id) ?? '—',
    makeup: r.status === 'missed',
  }));
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
    .select('id, text, active, kind, frequency')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as {
    id: string;
    text: string;
    active: boolean;
    kind: string | null;
    frequency: string | null;
  }[]).map((c) => ({
    id: c.id,
    text: c.text,
    active: c.active,
    kind: (c.kind === 'personal' ? 'personal' : 'shared') as ChoreKind,
    frequency: (['daily', 'weekly', 'monthly'].includes(c.frequency ?? '')
      ? c.frequency
      : 'daily') as ChoreFrequency,
  }));
}

/**
 * Beim Einstempeln: nicht erledigte Zuweisungen aus einer VERGANGENEN Periode
 * als 'missed' markieren und den Nutzer benachrichtigen (keine XP, nachholen).
 * Bereits gemeldete (missed) werden nicht erneut gemeldet. Best effort.
 */
export async function flagMissedChoresOnClockIn(
  orgId: string,
  userId: string,
): Promise<void> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('office_chore_assignments')
    .select('id, chore_id, period_key')
    .eq('assignee_id', userId)
    .eq('status', 'assigned');
  if (error) return;
  const rows = (data ?? []) as unknown as {
    id: string;
    chore_id: string;
    period_key: string | null;
  }[];
  if (rows.length === 0) return;

  const choreIds = [...new Set(rows.map((r) => r.chore_id))];
  const { data: chores } = await service
    .from('office_chores')
    .select('id, text, frequency')
    .in('id', choreIds);
  const byId = new Map(
    ((chores ?? []) as unknown as {
      id: string;
      text: string;
      frequency: string | null;
    }[]).map((c) => [c.id, c]),
  );

  const { createNotifications } = await import('@/features/notifications/create');
  for (const r of rows) {
    const chore = byId.get(r.chore_id);
    if (!chore || !r.period_key) continue;
    const current = chorePeriodKey(chore.frequency ?? 'daily');
    if (r.period_key === current) continue; // Periode läuft noch – nicht verpasst.

    await service
      .from('office_chore_assignments')
      .update({ status: 'missed' } as never)
      .eq('id', r.id);
    await createNotifications([
      {
        organizationId: orgId,
        recipientId: userId,
        type: 'chore' as NotificationType,
        title: 'Ordnungsdienst nicht erledigt',
        body: `„${chore.text}" wurde nicht gemacht – dafür gibt es keine XP. Bitte jetzt nachholen.`,
        entityType: 'office_chore',
        entityId: r.id,
      },
    ]);
  }
}
