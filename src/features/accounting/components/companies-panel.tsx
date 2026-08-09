import { listAccountingCompanies } from '@/features/accounting/queries';
import { rechtsformInfo } from '@/features/accounting/constants';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CompanySwitcher,
  type CompanyOption,
} from '@/features/accounting/components/company-switcher';
import { CompanyProfileForm } from '@/features/accounting/components/company-profile-form';
import { CompanyFolderLink } from '@/features/accounting/components/company-folder-link';

/**
 * Firmen tab: pick a company (Firma-Umschalter), edit its tax profile and link
 * its OneDrive Einnahmen/Ausgaben folders. Each company is a billing entity, so
 * its books, clients and invoices are strictly separated from the other.
 */
export async function CompaniesPanel({
  orgId,
  activeFirma,
  basePath,
}: {
  orgId: string;
  activeFirma?: string;
  basePath: string;
}) {
  const companies = await listAccountingCompanies(orgId);

  if (companies.length === 0) {
    return (
      <EmptyState
        icon="🏢"
        title="Noch keine Firma angelegt"
        description={
          'Firmen der Buchhaltung sind die Rechnungssteller. Lege im Tab „Rechnungen" mindestens einen an (z. B. supevo GmbH und ONE STEP).'
        }
        action={{ href: '/app/finance?tab=rechnungen', label: 'Zu den Rechnungsstellern' }}
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
  const info = rechtsformInfo(active.profile?.rechtsform);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompanySwitcher
          companies={options}
          activeId={active.entity.id}
          basePath={basePath}
        />
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">
              {active.clientCount}
            </span>{' '}
            Kunden
          </span>
          <span>
            <span className="font-medium text-foreground">
              {active.invoiceCount}
            </span>{' '}
            Rechnungen
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{active.entity.name}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {info.label}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {info.gewinnermittlung === 'euer' ? 'EÜR' : 'Bilanz'}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {info.steuerart === 'einkommensteuer'
              ? 'Einkommensteuer'
              : 'Körperschaftsteuer'}
          </span>
          {!info.gewerbesteuer && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              keine Gewerbesteuer
            </span>
          )}
        </div>

        <CompanyProfileForm
          billingEntityId={active.entity.id}
          profile={active.profile}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="mb-1 text-sm font-semibold">OneDrive-Ordner</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Verknüpfe die bestehenden Ordner für Einnahmen und Ausgaben. Das
          System liest von hier Belege ein und legt neue dort ab (ab Phase 2).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CompanyFolderLink
            billingEntityId={active.entity.id}
            kind="einnahmen"
            currentId={active.profile?.onedrive_einnahmen_folder_id ?? null}
            currentPath={active.profile?.onedrive_einnahmen_folder_path ?? null}
          />
          <CompanyFolderLink
            billingEntityId={active.entity.id}
            kind="ausgaben"
            currentId={active.profile?.onedrive_ausgaben_folder_id ?? null}
            currentPath={active.profile?.onedrive_ausgaben_folder_path ?? null}
          />
        </div>
      </div>
    </div>
  );
}
