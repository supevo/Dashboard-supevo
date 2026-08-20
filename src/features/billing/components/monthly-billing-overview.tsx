import { getMonthlyBillingOverview } from '@/features/billing/overview-queries';
import { InvoiceRowActions } from '@/features/billing/components/invoices-section';
import { GenerateInvoiceButton } from '@/features/billing/components/generate-invoice-button';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import { formatEuroCents } from '@/lib/money';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  finalized: 'Finalisiert',
  sent: 'Versendet',
  paid: 'Bezahlt',
  void: 'Storniert',
};

const MEMBERSHIP_LABEL: Record<string, string> = {
  paused: 'pausiert',
  canceled: 'gekündigt',
};

function statusTone(status: string): string {
  if (status === 'paid') return 'text-emerald-600 dark:text-emerald-400';
  if (status === 'sent') return 'text-sky-600 dark:text-sky-400';
  if (status === 'void') return 'text-muted-foreground';
  return 'text-amber-600 dark:text-amber-400';
}

/**
 * Monats-Rechnungsübersicht je Kunde im Bereich Finanzen → Rechnungen: Paket,
 * Zahlweg, Preis inkl. USt und der Rechnungsstatus für den gewählten Monat, mit
 * „Generieren" (Entwurf) bzw. den üblichen Rechnungs-Aktionen.
 */
export async function MonthlyBillingOverview({
  orgId,
  year,
  month,
  basePath,
}: {
  orgId: string;
  year: number;
  month: number;
  basePath: string;
}) {
  const rows = await getMonthlyBillingOverview(orgId, year, month);
  const now = new Date();
  const nowYear = now.getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2];
  // „Generieren" legt eine Rechnung für den LAUFENDEN Monat an – daher nur dort
  // anbieten, nicht rückwirkend in vergangenen Monaten.
  const isCurrentMonth = year === nowYear && month === now.getMonth() + 1;

  const active = rows.filter((r) => r.membershipStatus === 'active');
  const generated = active.filter((r) => r.invoice).length;
  const open = active.length - generated;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher year={year} month={month} years={years} basePath={basePath} />
        <p className="text-xs text-muted-foreground">
          {active.length} aktive Mitgliedschaften · {generated} generiert ·{' '}
          {open} offen
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Mitgliedschaften vorhanden.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Kunde</th>
                <th className="px-3 py-2 font-medium">Paket</th>
                <th className="px-3 py-2 font-medium">Zahlweg</th>
                <th className="px-3 py-2 text-right font-medium">Preis inkl. MwSt.</th>
                <th className="px-3 py-2 font-medium">Status ({String(month).padStart(2, '0')}/{year})</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const memberBadge = MEMBERSHIP_LABEL[r.membershipStatus];
                return (
                  <tr key={r.clientCompanyId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.clientName}</span>
                      {memberBadge && (
                        <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {memberBadge}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.packageLabel}</td>
                    <td className="px-3 py-2">
                      {r.paymentMethod === 'transfer' ? (
                        'Überweisung'
                      ) : r.sepaMandateMissing ? (
                        <span className="text-destructive" title="SEPA gewählt, aber kein Mandat/IBAN hinterlegt">
                          SEPA – Mandat fehlt
                        </span>
                      ) : (
                        'SEPA-Mandat'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {formatEuroCents(r.grossCents)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 ${r.invoice ? statusTone(r.invoice.status) : 'text-muted-foreground'}`}>
                      {r.invoice
                        ? STATUS_LABEL[r.invoice.status] ?? r.invoice.status
                        : 'Nicht generiert'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.invoice ? (
                        <InvoiceRowActions invoice={r.invoice} />
                      ) : r.membershipStatus === 'active' && isCurrentMonth ? (
                        <GenerateInvoiceButton clientCompanyId={r.clientCompanyId} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
