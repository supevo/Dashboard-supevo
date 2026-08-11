import { listAccountingCompanies } from '@/features/accounting/queries';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { CompaniesPanel } from '@/features/accounting/components/companies-panel';
import { AbgleichAusschlussEditor } from '@/features/accounting/components/abgleich-ausschluss-editor';

/**
 * Finanzen → Einstellungen (⚙️): company management (Firmen) plus the
 * per-company Abgleich settings (which Kontoauszug categories to exclude).
 */
export async function SettingsPanel({
  orgId,
  activeFirma,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);
  const active =
    companies.find((c) => c.entity.id === activeFirma) ?? companies[0];

  const options: CompanyOption[] = companies.map((c) => ({
    id: c.entity.id,
    label: c.entity.name,
    isDefault: c.entity.is_default,
  }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">🏢 Firmen</h2>
        <CompaniesPanel orgId={orgId} activeFirma={activeFirma} basePath={basePath} />
      </section>

      {active && (
        <section className="space-y-3 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              🔗 Abgleich – Kategorien ausklammern
            </h2>
            <CompanySwitcher
              companies={options}
              activeId={active.entity.id}
              basePath={basePath}
            />
          </div>
          <AbgleichAusschlussEditor
            key={active.entity.id}
            billingEntityId={active.entity.id}
            initial={active.profile?.abgleich_ausschluss ?? []}
          />
        </section>
      )}

      {companies.length === 0 && (
        <EmptyState
          icon="🏢"
          title="Noch keine Firma"
          description="Lege oben eine Firma an, um die Abgleich-Einstellungen zu nutzen."
        />
      )}
    </div>
  );
}
