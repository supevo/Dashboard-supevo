import { listAccountingCompanies } from '@/features/accounting/queries';
import { getTaxOverview } from '@/features/accounting/tax/tax-queries';
import { formatEuroCents } from '@/lib/money';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/alert';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { YearSwitcher } from '@/features/accounting/components/year-switcher';

function Row({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${
        strong ? 'border-t font-semibold' : ''
      }`}
    >
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{formatEuroCents(cents)}</span>
    </div>
  );
}

/**
 * Steuer tab: EÜR, USt-Voranmeldung (Jahressumme) und Steuerschätzung je Firma
 * und Kalenderjahr. Alle Zahlen aufgeschlüsselt; Schätzung ist eine Näherung.
 */
export async function TaxPanel({
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
        icon="📈"
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

  const nowYear = new Date().getFullYear();
  const years = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
  const ov = await getTaxOverview(active.entity.id, year);
  const firmaBase = `${basePath}&firma=${active.entity.id}`;

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

      {ov.profileMissing && (
        <Alert variant="destructive">
          Kein Steuerprofil hinterlegt – es gelten Standardannahmen
          (Einzelunternehmen). Bitte im Tab „Firmen“ die Rechtsform &amp;
          Hebesatz eintragen.
        </Alert>
      )}
      {ov.euer.unkategorisiert > 0 && (
        <Alert>
          {ov.euer.unkategorisiert} Umsätze ohne Kategorie fließen nicht in die
          Berechnung. Im Tab „Umsätze“ kategorisieren.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* EÜR */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-lg font-semibold">EÜR {ov.year}</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {ov.rechtsformLabel} · §4 Abs. 3 EStG (netto)
          </p>
          <div className="text-sm">
            <p className="mt-2 mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Betriebseinnahmen
            </p>
            {ov.euer.einnahmen.length === 0 && (
              <p className="text-muted-foreground">—</p>
            )}
            {ov.euer.einnahmen.map((l) => (
              <Row key={l.kategorieId} label={l.label} cents={l.nettoCents} />
            ))}
            <Row label="Summe Einnahmen (netto)" cents={ov.euer.einnahmenNettoCents} strong />

            <p className="mt-4 mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Betriebsausgaben
            </p>
            {ov.euer.ausgaben.length === 0 && (
              <p className="text-muted-foreground">—</p>
            )}
            {ov.euer.ausgaben.map((l) => (
              <Row key={l.kategorieId} label={l.label} cents={l.nettoCents} />
            ))}
            <Row label="Summe Ausgaben (netto)" cents={ov.euer.ausgabenNettoCents} strong />

            <div className="mt-3 flex items-center justify-between border-t-2 pt-2 text-base font-bold">
              <span>Gewinn / Verlust</span>
              <span className="tabular-nums">
                {formatEuroCents(ov.euer.gewinnCents)}
              </span>
            </div>
          </div>
        </section>

        {/* USt-VA */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-lg font-semibold">Umsatzsteuer {ov.year}</h2>
          {ov.kleinunternehmer ? (
            <p className="text-sm text-muted-foreground">
              Kleinunternehmer nach §19 UStG – keine Umsatzsteuer.
            </p>
          ) : (
            <div className="text-sm">
              <Row label="Umsatz 19 % (netto)" cents={ov.ust.umsatz19NettoCents} />
              <Row label="USt 19 %" cents={ov.ust.ust19Cents} />
              <Row label="Umsatz 7 % (netto)" cents={ov.ust.umsatz7NettoCents} />
              <Row label="USt 7 %" cents={ov.ust.ust7Cents} />
              <Row label="Vorsteuer" cents={ov.ust.vorsteuerCents} />
              <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>
                  {ov.ust.zahllastCents >= 0 ? 'Zahllast' : 'Erstattung'}
                </span>
                <span className="tabular-nums">
                  {formatEuroCents(Math.abs(ov.ust.zahllastCents))}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Steuerschätzung */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-1 text-lg font-semibold">Steuerschätzung {ov.year}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Näherung ohne Sozialversicherung/Freibeträge – kein Ersatz für den
          Steuerberater.
        </p>
        <div className="max-w-md text-sm">
          {ov.estimate.lines.map((l, i) => (
            <Row key={i} label={l.label} cents={l.cents} />
          ))}
          <Row label="Ertragsteuer gesamt" cents={ov.estimate.ertragsteuerCents} strong />
          {ov.estimate.offeneUstCents > 0 && (
            <Row label="Offene USt (Zahllast)" cents={ov.estimate.offeneUstCents} />
          )}
          <div className="mt-3 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-base font-bold text-primary">
            <span>Empfohlene Steuerrücklage</span>
            <span className="tabular-nums">
              {formatEuroCents(ov.estimate.ruecklageCents)}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
