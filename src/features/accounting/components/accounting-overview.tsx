import { listAccountingCompanies } from '@/features/accounting/queries';
import { rechtsformInfo } from '@/features/accounting/constants';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Buchhaltung – Übersicht (Phase 1): setup status per company. Shows which
 * companies have a tax profile and linked OneDrive folders, so the next steps
 * are obvious before the import/booking phases arrive.
 */
export async function AccountingOverview({ orgId }: { orgId: string }) {
  const companies = await listAccountingCompanies(orgId);

  if (companies.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="Buchhaltung einrichten"
        description="Lege zuerst deine Firmen (Rechnungssteller) an – z. B. supevo GmbH und ONE STEP. Danach kannst du hier Steuerprofil und OneDrive-Ordner verbinden."
        action={{ href: '/app/finance?tab=rechnungen', label: 'Rechnungssteller anlegen' }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Buchhaltung – Aufbau</p>
        <p className="mt-1">
          Phase 1 ist aktiv: Firmen, Steuerprofile und OneDrive-Ordner. Import
          von Kontoauszügen &amp; Belegen, KI-Auslesen, Abgleich sowie EÜR/USt
          und Steuerschätzung folgen in den nächsten Phasen.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {companies.map((c) => {
          const info = rechtsformInfo(c.profile?.rechtsform);
          const hasProfile = Boolean(c.profile);
          const hasEinnahmen = Boolean(c.profile?.onedrive_einnahmen_folder_id);
          const hasAusgaben = Boolean(c.profile?.onedrive_ausgaben_folder_id);
          return (
            <div key={c.entity.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{c.entity.name}</h3>
                {c.entity.is_default && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Standard
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {info.label} · {info.gewinnermittlung === 'euer' ? 'EÜR' : 'Bilanz'} ·{' '}
                {c.clientCount} Kunden · {c.invoiceCount} Rechnungen
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                <StatusRow ok={hasProfile} label="Steuerprofil hinterlegt" />
                <StatusRow ok={hasEinnahmen} label="Einnahmen-Ordner verknüpft" />
                <StatusRow ok={hasAusgaben} label="Ausgaben-Ordner verknüpft" />
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden>{ok ? '✅' : '⬜'}</span>
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}
