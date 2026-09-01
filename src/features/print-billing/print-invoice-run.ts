import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import { formatEuroCents } from '@/lib/money';
import { computeAmounts, resolveClientEntity } from '@/features/billing/invoice-service';
import { createNotifications } from '@/features/notifications/create';

export interface PrintInvoiceRunResult {
  invoicesCreated: number;
  clientsBilled: number;
  expensesBilled: number;
}

/** Vormonat als [start, end] (ISO), bezogen auf `ref` (Standard: heute). */
function previousMonthPeriod(ref: Date = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

interface OpenExpense {
  id: string;
  organization_id: string;
  client_company_id: string | null;
  task_id: string | null;
  supplier: string | null;
  client_charge_cents: number | null;
}

/**
 * Erzeugt die monatlichen Sammel-Ausgangsrechnungen für Druckprodukte: fasst
 * alle noch nicht abgerechneten Druck-Belege (mit berechnetem Kundenbetrag) je
 * Kunde zu EINEM Rechnungs-ENTWURF zusammen, verknüpft die Belege damit (gegen
 * Doppel-Berechnung) und benachrichtigt die Org-Admins zum Prüfen/Senden.
 * Selbst zahlende Kunden (Aufgabe = self_paid) werden nie berechnet.
 * Kein Auto-Versand – die Rechnung bleibt Entwurf.
 */
export async function runMonthlyPrintInvoices(
  ref: Date = new Date(),
): Promise<PrintInvoiceRunResult> {
  const service = createSupabaseServiceClient();
  const period = previousMonthPeriod(ref);

  // Offene, abrechenbare Belege (noch keiner Rechnung zugeordnet, Kundenbetrag
  // vorhanden). '*' + Cast, da die neuen Spalten (0173/0174) nicht getypt sind.
  const { data: rawExpenses } = await service
    .from('print_expenses')
    .select('*')
    .is('invoice_id' as never, null as never)
    .not('client_charge_cents' as never, 'is', null as never)
    .limit(5000);
  const expenses = (rawExpenses ?? []) as unknown as OpenExpense[];
  if (expenses.length === 0) {
    return { invoicesCreated: 0, clientsBilled: 0, expensesBilled: 0 };
  }

  // Selbst zahlende Aufgaben ausschließen (Beleg dient dort nur als interner
  // Nachweis, es wird keine Ausgangsrechnung erstellt).
  const taskIds = [...new Set(expenses.map((e) => e.task_id).filter((v): v is string => !!v))];
  const selfPaidTasks = new Set<string>();
  const taskTitles = new Map<string, string>();
  if (taskIds.length > 0) {
    const { data: tasks } = await service
      .from('tasks')
      .select('id, title, print_billing_status')
      .in('id', taskIds);
    for (const t of tasks ?? []) {
      taskTitles.set(t.id, t.title);
      if ((t as { print_billing_status?: string }).print_billing_status === 'self_paid') {
        selfPaidTasks.add(t.id);
      }
    }
  }

  // Nach Organisation + Kunde gruppieren.
  const groups = new Map<string, OpenExpense[]>();
  for (const e of expenses) {
    if (!e.client_company_id || e.client_charge_cents == null) continue;
    if (e.task_id && selfPaidTasks.has(e.task_id)) continue;
    const key = `${e.organization_id}::${e.client_company_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  let invoicesCreated = 0;
  let expensesBilled = 0;

  for (const [key, items] of groups) {
    const [orgId, clientCompanyId] = key.split('::');
    if (!orgId || !clientCompanyId || items.length === 0) continue;

    const { data: settings } = await service
      .from('billing_settings')
      .select('default_tax_rate, small_business')
      .eq('organization_id', orgId)
      .maybeSingle();
    const taxRate = settings?.default_tax_rate ?? 19;
    const smallBusiness = settings?.small_business ?? false;

    const netCents = items.reduce((n, e) => n + (e.client_charge_cents ?? 0), 0);
    const amounts = computeAmounts(netCents, taxRate, smallBusiness);
    const entity = await resolveClientEntity(service, orgId, clientCompanyId);

    const { data: invoice, error } = await service
      .from('invoices')
      .insert({
        organization_id: orgId,
        client_company_id: clientCompanyId,
        billing_entity_id: entity?.id ?? null,
        status: 'draft',
        service_period_start: period.start,
        service_period_end: period.end,
        currency: 'EUR',
        net_cents: amounts.netCents,
        tax_rate: amounts.taxRate,
        tax_cents: amounts.taxCents,
        gross_cents: amounts.grossCents,
        notes: `Sammelrechnung Druckprodukte ${formatDe(period.start)}–${formatDe(period.end)}`,
      } as never)
      .select('id')
      .single();
    if (error || !invoice) {
      logger.error('print_invoice.insert_failed', { error: error?.message, clientCompanyId });
      continue;
    }

    const rows = items.map((e, i) => ({
      invoice_id: invoice.id,
      position: i + 1,
      description: `Druckprodukt: ${
        (e.task_id && taskTitles.get(e.task_id)) || e.supplier || 'Druckauftrag'
      }`,
      quantity: 1,
      unit_net_cents: e.client_charge_cents ?? 0,
      tax_rate: amounts.taxRate,
      net_cents: e.client_charge_cents ?? 0,
    }));
    await service.from('invoice_items').insert(rows);

    // Belege der Rechnung zuordnen (verhindert erneute Berechnung).
    await service
      .from('print_expenses')
      .update({ invoice_id: invoice.id } as never)
      .in('id', items.map((e) => e.id));

    invoicesCreated += 1;
    expensesBilled += items.length;

    // Org-Admins zum Prüfen/Senden benachrichtigen.
    const { data: company } = await service
      .from('client_companies')
      .select('name')
      .eq('id', clientCompanyId)
      .maybeSingle();
    const { data: admins } = await service
      .from('memberships')
      .select('user_id, role')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('role', ['super_admin', 'agency_admin']);
    const recipients = [...new Set((admins ?? []).map((a) => a.user_id))];
    if (recipients.length > 0) {
      await createNotifications(
        recipients.map((userId) => ({
          organizationId: orgId,
          recipientId: userId,
          type: 'print_billing',
          title: `Druck-Sammelrechnung bereit: ${company?.name ?? 'Kunde'}`,
          body: `Entwurf über ${formatEuroCents(amounts.grossCents)} (${items.length} Druckauftrag/-aufträge) – bitte prüfen und senden.`,
          entityType: 'invoice',
          entityId: invoice.id,
        })),
      );
    }
  }

  return { invoicesCreated, clientsBilled: groups.size, expensesBilled };
}
