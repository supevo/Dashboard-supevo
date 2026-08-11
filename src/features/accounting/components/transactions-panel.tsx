import { listAccountingCompanies } from '@/features/accounting/queries';
import { listTransactions } from '@/features/accounting/transaction-queries';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { BankUploadForm } from '@/features/accounting/components/bank-upload-form';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import {
  KindFilter,
  type ArtFilter,
} from '@/features/accounting/components/kind-filter';
import { AutoCategorizeButton } from '@/features/accounting/components/auto-categorize-button';
import { TransactionCategorySelect } from '@/features/accounting/components/transaction-category-select';
import { DeleteTransactionButton } from '@/features/accounting/components/delete-transaction-button';
import { DeleteMonthTransactionsButton } from '@/features/accounting/components/delete-month-transactions-button';

function formatDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('de-DE');
}

/**
 * Umsätze tab: upload bank statements (CSV/CAMT.053/MT940) and browse the
 * imported transactions of one company. Categorization + reconciliation follow
 * in later phases; here we get the money movements into the system.
 */
export async function TransactionsPanel({
  orgId,
  activeFirma,
  year,
  month,
  art,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
  month: number;
  art: ArtFilter;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="💳"
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

  const period = { year, month };
  // High limit so "Alle Monate" doesn't silently hide older transactions
  // (the summary below is computed from this list too).
  const allTxns = await listTransactions(active.entity.id, period, 5000);
  // Einnahmen = Betrag > 0, Ausgaben = Betrag < 0.
  const txns = allTxns.filter((t) =>
    art === 'einnahmen'
      ? t.betrag_cents > 0
      : art === 'ausgaben'
        ? t.betrag_cents < 0
        : true,
  );
  const summary = txns.reduce(
    (acc, t) => {
      acc.count += 1;
      if (t.betrag_cents >= 0) acc.inCents += t.betrag_cents;
      else acc.outCents += t.betrag_cents;
      return acc;
    },
    { count: 0, inCents: 0, outCents: 0 },
  );
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
  const firmaBase = `${basePath}&firma=${active.entity.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanySwitcher
            companies={options}
            activeId={active.entity.id}
            basePath={basePath}
          />
          <MonthSwitcher
            year={year}
            month={month}
            years={years}
            basePath={firmaBase}
          />
          <KindFilter value={art} basePath={firmaBase} />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{summary.count}</span>{' '}
            Umsätze
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{formatEuroCents(summary.inCents)}
          </span>
          <span className="text-red-600 dark:text-red-400">
            {formatEuroCents(summary.outCents)}
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <BankUploadForm billingEntityId={active.entity.id} />
      </div>

      {txns.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AutoCategorizeButton billingEntityId={active.entity.id} />
          <DeleteMonthTransactionsButton
            billingEntityId={active.entity.id}
            year={year}
            month={month}
            count={summary.count}
          />
        </div>
      )}

      {txns.length === 0 ? (
        <EmptyState
          icon="📄"
          title="Noch keine Umsätze"
          description="Lade oben einen Kontoauszug hoch (CSV, CAMT.053 oder MT940)."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Empfänger / Zahler</th>
                <th className="px-3 py-2 font-medium">Verwendungszweck</th>
                <th className="px-3 py-2 font-medium">Kategorie</th>
                <th className="px-3 py-2 text-right font-medium">Betrag</th>
                <th className="px-3 py-2 font-medium" aria-label="Löschen"></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDate(t.datum)}
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2" title={t.gegen ?? ''}>
                    {t.gegen ?? '—'}
                  </td>
                  <td
                    className="max-w-[24rem] truncate px-3 py-2 text-muted-foreground"
                    title={t.zweck ?? ''}
                  >
                    {t.zweck ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <TransactionCategorySelect
                      transactionId={t.id}
                      value={t.kategorie_id}
                      konfidenz={t.konfidenz}
                    />
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                      t.betrag_cents >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatEuroCents(t.betrag_cents)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeleteTransactionButton id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
