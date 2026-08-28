import Link from 'next/link';
import { getMonthlyBillingOverview } from '@/features/billing/overview-queries';
import { InvoiceRowActions } from '@/features/billing/components/invoices-section';
import { GenerateInvoiceButton } from '@/features/billing/components/generate-invoice-button';
import {
  GenerateAllButton,
  SepaSubmittedToggle,
} from '@/features/billing/components/billing-overview-controls';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import { formatEuroCents } from '@/lib/money';

type OverviewFilter = 'alle' | 'offen' | 'sepa' | 'unbezahlt';
const FILTERS: { key: OverviewFilter; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'offen', label: 'Nicht generiert' },
  { key: 'sepa', label: 'SEPA ohne Mandat' },
  { key: 'unbezahlt', label: 'Unbezahlt' },
];

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
  filter = 'alle',
  steller,
  basePath,
}: {
  orgId: string;
  year: number;
  month: number;
  filter?: OverviewFilter;
  /** Ausgewählter Rechnungssteller (billing_entity id) oder undefined = alle. */
  steller?: string;
  basePath: string;
}) {
  const allRows = await getMonthlyBillingOverview(orgId, year, month);
  const now = new Date();
  const nowYear = now.getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2];
  // „Generieren" legt eine Rechnung für den LAUFENDEN Monat an – daher nur dort
  // anbieten, nicht rückwirkend in vergangenen Monaten.
  const isCurrentMonth = year === nowYear && month === now.getMonth() + 1;

  // Vorhandene Rechnungssteller (distinct) für die Filterleiste.
  const stellers = Array.from(
    new Map(
      allRows.map((r) => [r.billingEntityId ?? '', r.billingEntityName] as const),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));
  const multiSteller = stellers.length > 1;
  const selectedSteller =
    steller && stellers.some((s) => s.id === steller) ? steller : undefined;

  // Erst nach Rechnungssteller einschränken – Zähler + Zeilen beziehen sich dann
  // auf die gewählte Firma.
  const scoped = selectedSteller
    ? allRows.filter((r) => (r.billingEntityId ?? '') === selectedSteller)
    : allRows;

  const active = scoped.filter((r) => r.membershipStatus === 'active');
  const generated = active.filter((r) => r.invoice).length;
  const open = active.length - generated;

  const rows = scoped.filter((r) => {
    if (filter === 'offen') return r.membershipStatus === 'active' && !r.invoice;
    if (filter === 'sepa') return r.sepaMandateMissing;
    if (filter === 'unbezahlt')
      return r.invoice && !['paid', 'void'].includes(r.invoice.status);
    return true;
  });
  const stateQuery = `&jahr=${year}&monat=${month}`;
  const stellerQuery = selectedSteller ? `&steller=${selectedSteller}` : '';
  const chipClass = (isActive: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${
      isActive
        ? 'border-primary bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher year={year} month={month} years={years} basePath={basePath} />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {active.length} aktiv · {generated} generiert · {open} offen
          </p>
          {isCurrentMonth && <GenerateAllButton orgId={orgId} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`${basePath}${stateQuery}&bill=${f.key}${stellerQuery}`}
            className={chipClass(filter === f.key)}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {multiSteller && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Rechnungssteller:</span>
          <Link
            href={`${basePath}${stateQuery}&bill=${filter}`}
            className={chipClass(!selectedSteller)}
          >
            Alle
          </Link>
          {stellers.map((s) => (
            <Link
              key={s.id}
              href={`${basePath}${stateQuery}&bill=${filter}&steller=${s.id}`}
              className={chipClass(selectedSteller === s.id)}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

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
                {multiSteller && (
                  <th className="px-3 py-2 font-medium">Rechnungssteller</th>
                )}
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
                    {multiSteller && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.billingEntityName}
                      </td>
                    )}
                    <td className="px-3 py-2">{r.packageLabel}</td>
                    <td className="px-3 py-2">
                      {r.paymentMethod === 'transfer' ? (
                        'Überweisung'
                      ) : (
                        <div className="space-y-1">
                          {r.sepaMandateMissing ? (
                            <span
                              className="text-destructive"
                              title="SEPA gewählt, aber kein Mandat/IBAN hinterlegt"
                            >
                              SEPA – Mandat fehlt
                            </span>
                          ) : (
                            'SEPA-Mandat'
                          )}
                          {(r.debtorIban || r.mandateReference || r.mandateDate) && (
                            <details className="text-[11px] text-muted-foreground">
                              <summary className="cursor-pointer text-primary">
                                Mandat anzeigen
                              </summary>
                              <div className="mt-0.5 space-y-0.5">
                                {r.debtorIban && <div>IBAN: {r.debtorIban}</div>}
                                {r.mandateReference && (
                                  <div>Ref.: {r.mandateReference}</div>
                                )}
                                {r.mandateDate && <div>Datum: {r.mandateDate}</div>}
                              </div>
                            </details>
                          )}
                        </div>
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
                        <div className="flex flex-col items-end gap-1.5">
                          <InvoiceRowActions invoice={r.invoice} />
                          {r.paymentMethod !== 'transfer' &&
                            ['finalized', 'sent', 'paid'].includes(
                              r.invoice.status,
                            ) && (
                              <SepaSubmittedToggle
                                invoiceId={r.invoice.id}
                                submittedAt={r.invoice.sepa_submitted_at ?? null}
                              />
                            )}
                        </div>
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
