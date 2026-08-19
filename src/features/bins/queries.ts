import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { berlinToday } from '@/lib/time';
import { binDisplayLabel } from '@/features/bins/ics';

export interface OpenBinTask {
  id: string;
  label: string; // z. B. "🟡 Gelbe Tonne rausstellen"
  makeup: boolean; // überfällig/nachzuholen → keine XP
}

/** Datum +/- n Tage (ISO 'YYYY-MM-DD'), zeitzonen-neutral über UTC-Mittag. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ACTION_VERB: Record<string, string> = { out: 'rausstellen', in: 'wieder reinnehmen' };

/**
 * Weist beim Ausstempeln höchstens EINE fällige Mülltonnen-Aufgabe fair zu (die
 * am längsten fällige, noch nicht vergebene). „out" ist am Vorabend fällig,
 * „in" am Abfuhrtag. Stapelt nicht (offene Aufgabe bleibt bestehen). No-op ohne
 * Tabellen/Termine. Prüft nebenbei, ob der Kalender ausläuft.
 */
export async function assignClockOutBinTask(args: {
  orgId: string;
  userId: string;
  workSessionId: string | null;
}): Promise<void> {
  const { orgId, userId, workSessionId } = args;
  const service = createSupabaseServiceClient();
  const today = berlinToday();

  await maybeNotifyLowCoverage(orgId).catch(() => {});

  // Nicht stapeln.
  const { data: openMine, error: openErr } = await service
    .from('bin_task_assignments')
    .select('id')
    .eq('assignee_id', userId)
    .in('status', ['assigned', 'missed'])
    .limit(1);
  if (openErr) return; // Tabellen fehlen → Feature nicht eingerichtet
  if ((openMine ?? []).length > 0) return;

  // Termine im relevanten Fenster (überfällig bis heute).
  const { data: pickups } = await service
    .from('bin_pickups')
    .select('id, bin_key, bin_label, pickup_date')
    .eq('organization_id', orgId)
    .gte('pickup_date', addDays(today, -3))
    .lte('pickup_date', addDays(today, 1));
  const rows = (pickups ?? []) as unknown as {
    id: string;
    bin_key: string;
    bin_label: string;
    pickup_date: string;
  }[];
  if (rows.length === 0) return;

  // Virtuelle Aufgaben (out = Vorabend, in = Abfuhrtag), fällig <= heute.
  const virtual: { pickupId: string; action: 'out' | 'in'; due: string; label: string }[] = [];
  for (const p of rows) {
    const name = binDisplayLabel(p.bin_key, p.bin_label);
    virtual.push({ pickupId: p.id, action: 'out', due: addDays(p.pickup_date, -1), label: name });
    virtual.push({ pickupId: p.id, action: 'in', due: p.pickup_date, label: name });
  }
  const due = virtual.filter((v) => v.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  if (due.length === 0) return;

  // Bereits vergebene (pickup, action) ausschließen.
  const { data: existing } = await service
    .from('bin_task_assignments')
    .select('pickup_id, action')
    .in('pickup_id', rows.map((p) => p.id));
  const taken = new Set(
    ((existing ?? []) as unknown as { pickup_id: string; action: string }[]).map(
      (e) => `${e.pickup_id}:${e.action}`,
    ),
  );
  const pick = due.find((v) => !taken.has(`${v.pickupId}:${v.action}`));
  if (!pick) return;

  await service.from('bin_task_assignments').insert({
    organization_id: orgId,
    pickup_id: pick.pickupId,
    action: pick.action,
    due_date: pick.due,
    assignee_id: userId,
    status: 'assigned',
    work_session_id: workSessionId,
  } as never);
}

/** Offene Mülltonnen-Aufgaben des Nutzers (assigned + missed). */
export async function listMyOpenBinTasks(userId: string): Promise<OpenBinTask[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('bin_task_assignments')
    .select('id, action, status, pickup_id')
    .eq('assignee_id', userId)
    .in('status', ['assigned', 'missed'])
    .order('due_date', { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as unknown as {
    id: string;
    action: string;
    status: string;
    pickup_id: string;
  }[];
  if (rows.length === 0) return [];

  const { data: pickups } = await service
    .from('bin_pickups')
    .select('id, bin_key, bin_label')
    .in('id', rows.map((r) => r.pickup_id));
  const byId = new Map(
    ((pickups ?? []) as unknown as { id: string; bin_key: string; bin_label: string }[]).map(
      (p) => [p.id, p],
    ),
  );
  return rows.map((r) => {
    const p = byId.get(r.pickup_id);
    const name = p ? binDisplayLabel(p.bin_key, p.bin_label) : 'Tonne';
    return {
      id: r.id,
      label: `${name} ${ACTION_VERB[r.action] ?? r.action}`,
      makeup: r.status === 'missed',
    };
  });
}

/** Beim Einstempeln: überfällige, nicht erledigte Bin-Aufgaben als „missed"
 *  markieren und benachrichtigen (keine XP, trotzdem nachholen). */
export async function flagMissedBinTasksOnClockIn(userId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const { data, error } = await service
    .from('bin_task_assignments')
    .select('id, organization_id, action, due_date, pickup_id')
    .eq('assignee_id', userId)
    .eq('status', 'assigned')
    .lt('due_date', today);
  if (error) return;
  const rows = (data ?? []) as unknown as {
    id: string;
    organization_id: string;
    action: string;
    due_date: string;
    pickup_id: string;
  }[];
  for (const r of rows) {
    await service
      .from('bin_task_assignments')
      .update({ status: 'missed' } as never)
      .eq('id', r.id);
    await createNotifications(
      [
        {
          organizationId: r.organization_id,
          recipientId: userId,
          type: 'chore' as never,
          title: 'Mülltonne nicht erledigt',
          body: `Eine Tonnen-Aufgabe (${ACTION_VERB[r.action] ?? r.action}) wurde nicht gemacht – keine XP. Bitte trotzdem nachholen.`,
          entityType: 'bin_task',
          entityId: r.id,
        },
      ],
      userId,
    ).catch(() => {});
  }
}

export interface BinCoverage {
  coverageEnd: string | null;
  upcoming: { binKey: string; label: string; date: string }[];
  filename: string | null;
  uploadedAt: string | null;
}

/** Kalender-Status für die Admin-Ansicht. */
export async function getBinCoverage(orgId: string): Promise<BinCoverage> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const [{ data: meta }, { data: pickups }] = await Promise.all([
    service
      .from('bin_calendar_meta')
      .select('filename, uploaded_at, coverage_end')
      .eq('organization_id', orgId)
      .maybeSingle(),
    service
      .from('bin_pickups')
      .select('bin_key, bin_label, pickup_date')
      .eq('organization_id', orgId)
      .gte('pickup_date', today)
      .order('pickup_date', { ascending: true })
      .limit(8),
  ]);
  const m = meta as { filename: string | null; uploaded_at: string | null; coverage_end: string | null } | null;
  return {
    coverageEnd: m?.coverage_end ?? null,
    filename: m?.filename ?? null,
    uploadedAt: m?.uploaded_at ?? null,
    upcoming: ((pickups ?? []) as unknown as { bin_key: string; bin_label: string; pickup_date: string }[]).map(
      (p) => ({ binKey: p.bin_key, label: binDisplayLabel(p.bin_key, p.bin_label), date: p.pickup_date }),
    ),
  };
}

/** Benachrichtigt Org-Admins einmalig, wenn der Kalender in <= 14 Tagen ausläuft. */
async function maybeNotifyLowCoverage(orgId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const { data: meta } = await service
    .from('bin_calendar_meta')
    .select('coverage_end, low_notified_for')
    .eq('organization_id', orgId)
    .maybeSingle();
  const m = meta as { coverage_end: string | null; low_notified_for: string | null } | null;
  if (!m?.coverage_end) return;
  if (m.coverage_end > addDays(today, 14)) return; // noch genug Vorlauf
  if (m.low_notified_for === m.coverage_end) return; // schon gewarnt

  const { data: admins } = await service
    .from('memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .in('role', ['agency_admin', 'super_admin'])
    .eq('status', 'active');
  const recipients = [
    ...new Set(((admins ?? []) as unknown as { user_id: string }[]).map((a) => a.user_id)),
  ];
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: orgId,
        recipientId,
        type: 'chore' as never,
        title: 'Müllkalender läuft aus',
        body: `Die Abfuhrtermine reichen nur noch bis ${m.coverage_end}. Bitte in den Einstellungen eine neue ICS hochladen.`,
        entityType: 'bin_calendar',
        entityId: orgId,
      })),
    ).catch(() => {});
  }
  await service
    .from('bin_calendar_meta')
    .update({ low_notified_for: m.coverage_end } as never)
    .eq('organization_id', orgId);
}
