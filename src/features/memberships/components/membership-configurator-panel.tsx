import { getMembershipConfigurator } from '@/features/memberships/configurator-queries';
import { MembershipConfigurator } from '@/features/memberships/components/membership-configurator';
import { MembershipClientEditToggle } from '@/features/memberships/components/membership-client-edit-toggle';

/**
 * Server wrapper: loads the client's configurator state (promoting a due
 * scheduled change first) and renders the interactive baukasten.
 */
export async function MembershipConfiguratorPanel({
  clientCompanyId,
  show = 'all',
  isLegacy = true,
}: {
  clientCompanyId: string;
  show?: 'all' | 'stages' | 'modules';
  /** Nur Legacy-Kunden (Baukasten) können ihre Module selbst anpassen. */
  isLegacy?: boolean;
}) {
  const view = await getMembershipConfigurator(clientCompanyId);
  if (!view) {
    return (
      <p className="text-sm text-muted-foreground">
        Kunde nicht gefunden.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <MembershipConfigurator
        modules={view.modules}
        clientCompanyId={clientCompanyId}
        initialSelections={view.active.selections}
        priceContext={view.priceContext}
        pending={
          view.pending
            ? {
                netCents: view.pending.netCents,
                effectiveDate: view.pending.effectiveDate,
                name: view.pending.name,
              }
            : null
        }
        show={show}
        taxRatePct={view.taxRatePct}
        initialCustomNetCents={view.active.customNetCents}
      />
      <div className="border-t pt-4">
        {isLegacy ? (
          <MembershipClientEditToggle
            clientCompanyId={clientCompanyId}
            enabled={view.clientCanEdit}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Selbstbedienung der Module ist nur für Baukasten-Kunden möglich.
            supevo-Kunden wechseln im Portal nur ihre Stufe. Soll dieser Kunde
            seine Module selbst anpassen, stelle ihn unter „Stammdaten“ auf den
            Kundentyp Baukasten (Legacy) um.
          </p>
        )}
      </div>
    </div>
  );
}
