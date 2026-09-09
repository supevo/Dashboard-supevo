import Link from 'next/link';
import { listAccountingCompanies } from '@/features/accounting/queries';
import { getMonthClearing } from '@/features/accounting/month-clearing-queries';
import { listImportLogs } from '@/features/accounting/receipt-queries';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { MonthSwitcher } from '@/features/accounting/components/month-switcher';
import { RescanBelegeButton } from '@/features/accounting/components/rescan-belege-button';
import { ClearingRowActions } from '@/features/accounting/components/clearing-row-actions';
import { EmptyState } from '@/components/ui/empty-state';
import { formatEuroCents } from '@/lib/money';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [, mo, day] = d.split('-');
  return day ? `${day}.${mo}.` : d;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * „Monat klären": eine Liste je Monat, verankert am Kontoauszug. Führt
 * Kontoauszug, Belege und Zuordnung zusammen – pro Umsatz sofort sichtbar, ob
 * ein Beleg da ist, fehlt oder keiner nötig ist (mit Grund).
 */
export async function MonthClearingPanel({
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
        icon="📋"
        title="Noch keine Firma"
        description="Lege zuerst eine Firma an und verknüpfe ihre OneDrive-Ordner im Tab „Firmen“."
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

  const m = month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;
  const [clearing, logs] = await Promise.all([
    getMonthClearing(active.entity.id, year, m),
    listImportLogs(active.entity.id, 1),
  ]);
  const { rows, summary } = clearing;
  const pct = summary.total === 0 ? 0 : Math.round((summary.geklaert / summary.total) * 100);
  const lastLog = logs[0];

  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2];
  const firmaBase = `${basePath}&firma=${active.entity.id}`;

  const stepDone = (n: number) =>
    n === 1 ? summary.total > 0 : n === 2 ? Boolean(lastLog) : summary.offen === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CompanySwitcher companies={options} activeId={active.entity.id} basePath={basePath} />
          <MonthSwitcher year={year} month={m} years={years} basePath={firmaBase} />
        </div>
        <RescanBelegeButton billingEntityId={active.entity.id} />
      </div>

      {/* Wizard */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {[
          { n: 1, t: 'Kontoauszug hochladen', s: `${summary.total} Umsätze im Monat` },
          { n: 2, t: 'Belege aus OneDrive', s: 'automatisch gescannt (2026 → Monat)' },
          { n: 3, t: 'Zuordnen & prüfen', s: `${summary.geklaert}/${summary.total} geklärt` },
        ].map((step) => {
          const done = stepDone(step.n);
          return (
            <li
              key={step.n}
              className={`flex items-start gap-3 rounded-xl border p-3 ${done ? 'border-emerald-500/40 bg-emerald-500/[0.05]' : 'bg-card'}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'border text-muted-foreground'}`}
              >
                {done ? '✓' : step.n}
              </span>
              <div>
                <div className="text-sm font-semibold">{step.t}</div>
                <div className="text-xs text-muted-foreground">{step.s}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Fortschritt */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className="grid h-14 w-14 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#0f6d5f ${pct}%, rgba(120,130,125,.22) 0)`,
            }}
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-card text-sm font-bold">
              {pct}%
            </div>
          </div>
          <div className="text-sm">
            <div className="font-semibold">
              {summary.geklaert} von {summary.total} geklärt
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.offen === 0
                ? 'Alles geklärt 🎉'
                : `${summary.offen} brauchen noch deine Hand`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="text-amber-700 dark:text-amber-300">⚠ Beleg fehlt: {summary.missing}</span>
          <span className="text-amber-700 dark:text-amber-300">⚠ Grund fehlt: {summary.noReason}</span>
        </div>
      </div>

      {/* Liste */}
      {rows.length === 0 ? (
        <EmptyState
          icon="🏦"
          title={`Keine Umsätze im ${MONTHS[m - 1]} ${year}`}
          description="Lade zuerst den Kontoauszug dieses Monats hoch (Tab „Kontoauszüge“)."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Was der Kontoauszug sagt</th>
                <th className="px-3 py-2 font-medium">Kategorie</th>
                <th className="px-3 py-2 text-right font-medium">Betrag</th>
                <th className="px-3 py-2 font-medium">Beleg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const attn = r.status === 'missing' || r.status === 'none_no_reason';
                return (
                  <tr
                    key={r.id}
                    className={`border-t align-top ${attn ? 'bg-amber-500/[0.06]' : ''}`}
                  >
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{fmtDate(r.datum)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.gegen || '—'}</div>
                      {r.zweck && (
                        <div className="text-xs text-muted-foreground">{r.zweck}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.kategorieLabel ? (
                        <span className="rounded border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                          {r.kategorieLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          nicht kategorisiert
                        </span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${r.art === 'Einnahme' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                      {r.art === 'Einnahme' ? '+ ' : '− '}
                      {formatEuroCents(Math.abs(r.betragCents))}
                    </td>
                    <td className="px-3 py-3">
                      {r.status === 'ok' && (
                        <div>
                          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            ● Beleg vorhanden
                          </div>
                          {r.belegFile && (
                            <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                              🧾 {r.belegFile}
                            </div>
                          )}
                        </div>
                      )}
                      {r.status === 'not_needed' && (
                        <div className="text-xs text-muted-foreground">
                          ○ kein Beleg erforderlich
                        </div>
                      )}
                      {r.status === 'none' && (
                        <div>
                          <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                            ● kein Beleg nötig
                          </div>
                          <div className="mt-0.5 text-xs italic text-muted-foreground">
                            {r.reason}
                          </div>
                        </div>
                      )}
                      {(r.status === 'missing' || r.status === 'none_no_reason') && (
                        <div>
                          <div className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            {r.status === 'none_no_reason'
                              ? '● Grund fehlt'
                              : '● Beleg fehlt'}
                          </div>
                          <ClearingRowActions
                            txId={r.id}
                            billingEntityId={active.entity.id}
                            defaultQuery={r.gegen ?? ''}
                            suggestions={r.suggestions}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Der <strong>Steuerberater-Export</strong> bleibt eine eigene Sache:{' '}
        <Link href="/app/finance?tab=monatsabschluss" className="text-primary hover:underline">
          zum Monatsabschluss &amp; CSV-Export
        </Link>
        .
      </p>
    </div>
  );
}
