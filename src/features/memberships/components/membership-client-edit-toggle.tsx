'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setMembershipClientEditAction } from '@/features/memberships/configurator-actions';

/**
 * Agency switch: unlock the portal self-service configurator for a client
 * (only meaningful for legacy clients). When on, the client can adjust their
 * modules themselves in the portal; changes still apply from next month.
 */
export function MembershipClientEditToggle({
  clientCompanyId,
  enabled,
}: {
  clientCompanyId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    const res = await setMembershipClientEditAction(clientCompanyId, next);
    setBusy(false);
    if (res.status !== 'success') setOn(!next); // revert on failure
    else router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={on} onChange={toggle} disabled={busy} />
      <span>
        Kunde darf seine Mitgliedschaft im Portal selbst anpassen
        <span className="block text-xs text-muted-foreground">
          Nur für Legacy-Kunden sinnvoll. Änderungen des Kunden gelten ab dem
          Folgemonat; abgewählte Module melden wir dem Team.
        </span>
      </span>
    </label>
  );
}
