import Link from 'next/link';
import { listAccountingCompanies } from '@/features/accounting/queries';
import { getMonthClose } from '@/features/accounting/month-close-queries';
import { getBookingExportRows } from '@/features/accounting/export-queries';
import { ExportBookingsButton } from '@/features/accounting/components/export-bookings-button';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { YearSwitcher } from '@/features/accounting/components/year-switcher';
import { NoReceiptToggle } from '@/features/accounting/components/no-receipt-toggle';

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];
const MONTHS_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function Step({
  n,
  done,
  title,
  desc,
  action,
}: {
  n: number;
  done: boolean;
  title: string;
  desc: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        done ? 'bg-emerald-500/5' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done
              ? 'bg-emerald-500 text-white'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {done ? '✓' : n}
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Monatsabschluss: choose a month (progress bar = how many bookings already have
 * a receipt) and work the four-step checklist – import statement, check
 * categories, add missing receipts, reconcile invoices.
 */
export async function MonthClosePanel({
  orgId,
  activeFirma,
  year,
  month,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
  month: number;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="📅"
        title="Noch keine Firma"
        description="Lege zuerst eine Firma im Tab „Firmen“ an."
        action={{ href: '/app/finance?tab=firmen', label: 'Zu den Firmen' }}
      />
    );
  }
  const active =
    companies.find((c) => c.entity.id === activeFirma) ?? companies[0];
  if (!active) return null;
  const options: CompanyOption[] = companies.map((c) => ({
    id: c.entity.id,
    label: c.entity.name,
    isDefault: c.entity.is_default,
  }));

  const sel = Math.min(12, Math.max(1, month));
  const [mc, exportRows] = await Promise.all([
    getMonthClose(active.entity.id, year, sel),
    getBookingExportRows(active.entity.id, year, sel),
  ]);

  const firmaBase = `${basePath}&firma=${active.entity.id}`;
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
  const monthHref = (m: number) => `${firmaBase}&jahr=${year}&monat=${m}`;
  const tabHref = (t: string) => `/app/finance?tab=${t}&firma=${active.entity.id}`;

  const step1Done = mc.step1Count > 0;
  const step2Done = step1Done && mc.step2Uncategorized === 0;
  const step3Done = step1Done && mc.step3Gaps.length === 0;
  const step4Done = mc.step4OpenPayments === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompanySwitcher
          companies={options}
          activeId={active.entity.id}
          basePath={basePath}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ExportBookingsButton
            rows={exportRows}
            fileName={`buchungen-${active.entity.name}-${MONTHS_LONG[sel - 1]}-${year}.csv`.replace(
              /\s+/g,
              '_',
            )}
          />
          <YearSwitcher year={year} years={years} basePath={firmaBase} />
        </div>
      </div>

      {/* Month grid */}
      <section>
        <h2 className="text-sm font-semibold">Monat wählen</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Balken zeigt, wie viele Buchungen des Monats schon belegt sind.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {mc.months.map((m) => {
            const isSel = m.month === sel;
            const ratio = m.total > 0 ? m.belegt / m.total : 0;
            const full = m.total > 0 && m.belegt === m.total;
            return (
              <Link
                key={m.month}
                href={monthHref(m.month)}
                className={`rounded-lg border p-3 transition hover:shadow-sm ${
                  isSel ? 'border-primary ring-1 ring-primary' : ''
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">
                    {MONTHS[m.month - 1]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.hasData ? `${m.belegt}/${m.total} belegt` : 'keine Umsätze'}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={full ? 'h-full bg-emerald-500' : 'h-full bg-primary'}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Checklist */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          {MONTHS_LONG[sel - 1]} {year} abschließen
        </h2>
        <p className="text-xs text-muted-foreground">Vier Schritte, der Reihe nach.</p>
        <div className="space-y-2">
          <Step
            n={1}
            done={step1Done}
            title="Kontoauszug importieren"
            desc={
              step1Done
                ? `${mc.step1Count} Buchungen für ${MONTHS[sel - 1]} erfasst.`
                : 'Noch keine Buchungen in diesem Monat.'
            }
            action={{ href: tabHref('umsaetze'), label: 'Auszug hochladen' }}
          />
          <Step
            n={2}
            done={step2Done}
            title="Kategorien prüfen"
            desc={
              mc.step2Uncategorized === 0
                ? 'Alle Buchungen sind kategorisiert.'
                : `${mc.step2Uncategorized} Buchungen ohne Kategorie.`
            }
            action={{ href: tabHref('umsaetze'), label: 'Kategorien' }}
          />
          <Step
            n={3}
            done={step3Done}
            title="Belege nachreichen"
            desc={
              mc.step3Gaps.length === 0
                ? 'Zu jeder Buchung liegt ein Beleg.'
                : `${mc.step3Gaps.length} Buchungen ohne Beleg.`
            }
            action={{ href: tabHref('belege'), label: 'Belege' }}
          />
          <Step
            n={4}
            done={step4Done}
            title="Rechnungen abgleichen"
            desc={
              step4Done
                ? 'Keine offenen Zahlungen zum Zuordnen.'
                : `${mc.step4OpenPayments} offene Zuordnungen.`
            }
            action={{ href: tabHref('abgleich'), label: 'Abgleich öffnen' }}
          />
        </div>
      </section>

      {/* Receipt gaps */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Fehlende Belege in {MONTHS[sel - 1]}
          </h2>
          {mc.step3Gaps.length === 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
              vollständig
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Der Kontoauszug sagt, was da war – hier steht, wozu der Nachweis fehlt.
        </p>

        {mc.step3Gaps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Lücken – zu jeder Buchung liegt ein Beleg. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {mc.step3Gaps.map((g) => (
                  <tr key={g.id} className="border-t first:border-t-0">
                    <td className="px-3 py-2">{g.datum}</td>
                    <td className="px-3 py-2">{g.gegen ?? '—'}</td>
                    <td className="max-w-[20rem] truncate px-3 py-2 text-muted-foreground" title={g.zweck ?? ''}>
                      {g.kategorieLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {formatEuroCents(g.betragCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <NoReceiptToggle transactionId={g.id} value={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mc.intentionalNoReceipt.length > 0 && (
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {mc.intentionalNoReceipt.length} Buchung(en) laufen bewusst ohne
              Beleg – ansehen
            </summary>
            <table className="mt-2 w-full">
              <tbody>
                {mc.intentionalNoReceipt.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="px-2 py-1.5">{g.datum}</td>
                    <td className="px-2 py-1.5">{g.gegen ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      {formatEuroCents(g.betragCents)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NoReceiptToggle transactionId={g.id} value={true} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </div>
  );
}
