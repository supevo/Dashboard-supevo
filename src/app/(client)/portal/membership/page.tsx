import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getPortalMembership } from '@/features/billing/portal';
import { PortalMembership } from '@/features/billing/components/portal-membership';
import { getPortalMembershipConfigurator } from '@/features/memberships/configurator-queries';
import { MembershipConfigurator } from '@/features/memberships/components/membership-configurator';
import { getClientDocuments, type DocLink } from '@/features/documents/queries';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

function DocList({ items, empty }: { items: DocLink[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{d.label}</div>
            {d.meta && <div className="text-xs text-muted-foreground">{d.meta}</div>}
          </div>
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ⬇ Download
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function PortalMembershipPage() {
  await requireClientPage();
  const [cfg, membershipView, docs] = await Promise.all([
    getPortalMembershipConfigurator(),
    getPortalMembership(),
    getClientDocuments(),
  ]);
  // Legacy-Kunden sehen den Modul-Baukasten; supevo-Kunden die klassische Sicht.
  const showModules = cfg?.isLegacy ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.nav.membership}</h1>
        <p className="text-sm text-muted-foreground">
          Hier sehen Sie Ihr aktuelles Paket und können es anpassen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.nav.membership}</CardTitle>
        </CardHeader>
        <CardContent>
          {showModules && cfg ? (
            <MembershipConfigurator
              mode="portal"
              readOnly={!cfg.clientCanEdit}
              initialSelections={cfg.active.selections}
              initialName={cfg.active.name}
              priceContext={cfg.priceContext}
              pending={
                cfg.pending
                  ? {
                      netCents: cfg.pending.netCents,
                      effectiveDate: cfg.pending.effectiveDate,
                      name: cfg.pending.name,
                    }
                  : null
              }
            />
          ) : membershipView ? (
            <PortalMembership view={membershipView} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Für Ihr Konto ist aktuell keine Mitgliedschaft hinterlegt.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📄 Verträge &amp; Mandate</CardTitle>
        </CardHeader>
        <CardContent>
          <DocList items={docs.contracts} empty="Noch keine Verträge hinterlegt." />
        </CardContent>
      </Card>
    </div>
  );
}
