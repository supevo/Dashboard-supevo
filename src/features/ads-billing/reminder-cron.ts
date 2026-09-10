import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';

const GAP_HOURS = 20;
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** Der abzurechnende Monat = der zuletzt abgeschlossene (Vormonat). */
function lastClosedMonth(now: Date): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1..12
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

/**
 * Erinnert die Verantwortlichen an offene Ads-Abrechnungen: für den zuletzt
 * abgeschlossenen Monat ist je aktivem Mandat der verbrauchte Betrag einzutragen
 * und der Monat abzurechnen. Nudge, bis Betrag erfasst UND abgerechnet ist.
 * Läuft mit dem Service-Client (System-Job).
 */
export async function runAdsBillingReminders(): Promise<{ notified: number }> {
  const service = createSupabaseServiceClient();
  const now = new Date();
  const { year, month } = lastClosedMonth(now);
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`;

  const { data: mandates } = await service
    .from('ads_mandates')
    .select(
      'id, organization_id, client_company_id, platform, responsible_user_id, active, reminded_at',
    )
    .eq('active', true)
    .limit(2000);
  const rows = (mandates ?? []) as {
    id: string;
    organization_id: string;
    client_company_id: string;
    platform: string;
    responsible_user_id: string | null;
    active: boolean;
    reminded_at: string | null;
  }[];
  if (rows.length === 0) return { notified: 0 };

  // Erfassungen des Zielmonats laden.
  const { data: entries } = await service
    .from('ads_monthly_entries')
    .select('mandate_id, spent_cents, billed')
    .eq('month', monthDate)
    .in(
      'mandate_id',
      rows.map((r) => r.id),
    );
  const byMandate = new Map(
    (entries ?? []).map((e) => [e.mandate_id, e] as const),
  );

  // Kundennamen für die Nachricht.
  const clientIds = [...new Set(rows.map((r) => r.client_company_id))];
  const { data: clients } = await service
    .from('client_companies')
    .select('id, name')
    .in('id', clientIds);
  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const gapCutoff = now.getTime() - GAP_HOURS * 60 * 60 * 1000;
  const entriesToSend: Parameters<typeof createNotifications>[0] = [];
  const stampIds: string[] = [];

  for (const m of rows) {
    if (!m.responsible_user_id) continue; // niemand zuständig → kein Nudge
    const e = byMandate.get(m.id);
    const spentMissing = !e || e.spent_cents == null;
    const notBilled = !e || !e.billed;
    if (!spentMissing && !notBilled) continue; // alles erledigt

    const last = m.reminded_at ? new Date(m.reminded_at).getTime() : 0;
    if (last > gapCutoff) continue; // Entprellung

    const plat = m.platform === 'meta' ? 'Meta' : 'Google';
    const client = nameById.get(m.client_company_id) ?? 'Kunde';
    const what = spentMissing
      ? 'Verbrauch eintragen'
      : 'noch abrechnen';
    entriesToSend.push({
      organizationId: m.organization_id,
      recipientId: m.responsible_user_id,
      type: 'ads_billing' as const,
      title: '📣 Ads-Abrechnung offen',
      body: `${plat} Ads für ${client} – ${MONTH_NAMES[month - 1]} ${year}: ${what}.`,
      entityType: 'ads_mandate',
      entityId: m.id,
    });
    stampIds.push(m.id);
  }

  if (entriesToSend.length === 0) return { notified: 0 };
  await createNotifications(entriesToSend);
  await service
    .from('ads_mandates')
    .update({ reminded_at: now.toISOString() } as never)
    .in('id', stampIds);

  logger.info('cron.ads_reminders.done', {
    mandates: stampIds.length,
    entries: entriesToSend.length,
  });
  return { notified: entriesToSend.length };
}
