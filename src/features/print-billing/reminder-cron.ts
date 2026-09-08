import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';

/** Ab wann an die (noch fehlende) Endrechnung erinnert wird. */
const FINAL_AFTER_DAYS = 10;
/** Mindestabstand zwischen zwei Erinnerungen (Entprellung, ~täglich). */
const GAP_HOURS = 20;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Tägliche Erinnerung an fehlende Druckerei-Rechnungen: die Proforma sofort, die
 * nachträgliche Endrechnung ab ~10 Tagen – jeweils bis sie hochgeladen ist.
 * Empfänger sind die zugewiesenen Mitarbeiter der Aufgabe (In-App + Push).
 * Läuft mit dem Service-Client (System-Job).
 */
export async function runPrintBillingReminders(): Promise<{ notified: number }> {
  const service = createSupabaseServiceClient();
  const now = Date.now();

  // Offene Druck-Abrechnungen: erkannt/bestellt oder Endrechnung noch offen.
  // 'self_paid'/'dismissed'/null sind ausgenommen.
  const { data: tasks } = await service
    .from('tasks')
    .select(
      'id, title, organization_id, print_billing_status, print_flagged_at, print_reminded_at, created_at',
    )
    .in('print_billing_status', ['required', 'ordered', 'settled'])
    .limit(2000);
  const rows = (tasks ?? []) as {
    id: string;
    title: string;
    organization_id: string;
    print_billing_status: string | null;
    print_flagged_at: string | null;
    print_reminded_at: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return { notified: 0 };

  const taskIds = rows.map((t) => t.id);

  // Welche Rechnungen liegen schon vor (Proforma/Endrechnung)?
  const { data: exp } = await service
    .from('print_expenses')
    .select('task_id, kind')
    .in('task_id', taskIds);
  const proformaBy = new Set<string>();
  const finalBy = new Set<string>();
  for (const e of (exp ?? []) as { task_id: string | null; kind?: string | null }[]) {
    if (!e.task_id) continue;
    if (e.kind === 'proforma') proformaBy.add(e.task_id);
    else finalBy.add(e.task_id); // 'final' oder Alt-Beleg ohne kind
  }

  // Zuständige (Bearbeiter) je Aufgabe.
  const { data: assignees } = await service
    .from('task_assignees')
    .select('task_id, user_id')
    .in('task_id', taskIds);
  const assigneesBy = new Map<string, string[]>();
  for (const a of (assignees ?? []) as { task_id: string; user_id: string }[]) {
    const list = assigneesBy.get(a.task_id) ?? [];
    list.push(a.user_id);
    assigneesBy.set(a.task_id, list);
  }

  const gapCutoff = now - GAP_HOURS * 60 * 60 * 1000;
  const entries: Parameters<typeof createNotifications>[0] = [];
  const stampIds: string[] = [];

  for (const t of rows) {
    const proformaMissing = !proformaBy.has(t.id);
    const finalMissing = !finalBy.has(t.id);
    if (!proformaMissing && !finalMissing) continue; // beides da → nichts zu tun

    const anchor = new Date(t.print_flagged_at ?? t.created_at).getTime();
    const finalDue = finalMissing && now - anchor >= FINAL_AFTER_DAYS * DAY;
    // Proforma sofort fällig; Endrechnung erst ab der Frist.
    if (!proformaMissing && !finalDue) continue;

    // Entprellung: höchstens ~1×/Tag erinnern.
    const last = t.print_reminded_at ? new Date(t.print_reminded_at).getTime() : 0;
    if (last > gapCutoff) continue;

    const recipients = [...new Set(assigneesBy.get(t.id) ?? [])];
    if (recipients.length === 0) continue; // niemand zugewiesen → kein Hinweis

    const missing =
      proformaMissing && finalDue
        ? 'die Proforma und die Endrechnung'
        : proformaMissing
          ? 'die Proforma-Rechnung'
          : 'die Endrechnung';
    for (const recipientId of recipients) {
      entries.push({
        organizationId: t.organization_id,
        recipientId,
        type: 'print_billing' as const,
        title: '💶 Druckerei-Rechnung fehlt',
        body: `Für „${t.title}" fehlt noch ${missing}. Bitte hochladen.`,
        entityType: 'task',
        entityId: t.id,
      });
    }
    stampIds.push(t.id);
  }

  if (entries.length === 0) return { notified: 0 };

  await createNotifications(entries);
  // Erinnerungszeitpunkt setzen (Entprellung für den nächsten Lauf).
  await service
    .from('tasks')
    .update({ print_reminded_at: new Date().toISOString() })
    .in('id', stampIds);

  logger.info('cron.print_reminders.done', { tasks: stampIds.length, entries: entries.length });
  return { notified: entries.length };
}
