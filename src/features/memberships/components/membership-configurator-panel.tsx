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
}: {
  clientCompanyId: string;
  show?: 'all' | 'stages' | 'modules';
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
      />
      <div className="border-t pt-4">
        <MembershipClientEditToggle
          clientCompanyId={clientCompanyId}
          enabled={view.clientCanEdit}
        />
      </div>
    </div>
  );
}
