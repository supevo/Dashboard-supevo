import { listAccountingCompanies } from '@/features/accounting/queries';
import { getFinanceOverview } from '@/features/accounting/overview-queries';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { YearSwitcher } from '@/features/accounting/components/year-switcher';

const MONTHS = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  const valueClass =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : '';
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Übersicht: headline KPIs (net income/expense, EÜR profit, tax reserve), a
 * monthly income-vs-expense bar chart and the largest expense groups – so the
 * company's state is visible at a glance.
 */
export async function OverviewPanel({
  orgId,
  activeFirma,
  year,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  year: number;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="📊"
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

  const ov = await getFinanceOverview(active.entity.id, year);
  const firmaBase = `${basePath}&firma=${active.entity.id}`;
  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];

  const maxBar = Math.max(
    1,
    ...ov.monthly.map((m) => Math.max(m.einnahmenCents, m.ausgabenCents)),
  );
  const maxGroup = Math.max(1, ...ov.expenseGroups.map((g) => g.cents));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompanySwitcher
          companies={options}
          activeId={active.entity.id}
          basePath={basePath}
        />
        <YearSwitcher year={year} years={years} basePath={firmaBase} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Einnahmen netto"
          value={formatEuroCents(ov.einnahmenNettoCents)}
          sub={`${ov.zahlungseingaenge} Zahlungseingänge`}
          tone="good"
        />
        <Kpi
          label="Ausgaben netto"
          value={formatEuroCents(ov.ausgabenNettoCents)}
          tone="bad"
        />
        <Kpi
          label="Gewinn (EÜR)"
          value={formatEuroCents(ov.gewinnCents)}
          sub={ov.gewinnCents >= 0 ? 'Überschuss' : 'Einnahmenüberschuss negativ'}
          tone={ov.gewinnCents >= 0 ? 'good' : 'bad'}
        />
        <Kpi
          label="Steuerrücklage"
          value={formatEuroCents(ov.ruecklageCents)}
          sub={`Ertragsteuer ${formatEuroCents(ov.ertragsteuerCents)} · USt ${formatEuroCents(Math.max(0, ov.ustZahllastCents))}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly bar chart */}
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Einnahmen und Ausgaben {year}</h2>
          <p className="mb-3 text-xs text-muted-foreground">Nettobeträge je Monat</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Einnahmen
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" /> Ausgaben
            </span>
          </div>
          <div className="mt-3 flex h-40 items-end gap-1">
            {ov.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500"
                    style={{ height: `${(m.einnahmenCents / maxBar) * 100}%` }}
                    title={`Einnahmen: ${formatEuroCents(m.einnahmenCents)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-amber-500"
                    style={{ height: `${(m.ausgabenCents / maxBar) * 100}%` }}
                    title={`Ausgaben: ${formatEuroCents(m.ausgabenCents)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {MONTHS[m.month - 1]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Largest expense groups */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Größte Ausgabenblöcke</h2>
          {ov.expenseGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Ausgaben.</p>
          ) : (
            <div className="space-y-3">
              {ov.expenseGroups.map((g) => (
                <div key={g.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{g.label}</span>
                    <span className="font-medium">{formatEuroCents(g.cents)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(g.cents / maxGroup) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
