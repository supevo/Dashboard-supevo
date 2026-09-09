'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleCreditorAction } from '@/features/accounting/reconcile-actions';

/**
 * Markiert die Gegenpartei eines Postens als Kreditor (z. B. Google): läuft dann
 * übers Kreditorenkonto und wird nicht mehr als „Beleg fehlt" angemahnt. `enabled`
 * = true fügt hinzu, false hebt auf.
 */
export function CreditorToggle({
  billingEntityId,
  name,
  enabled,
  label,
}: {
  billingEntityId: string;
  name: string;
  enabled: boolean;
  label: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  if (!name.trim()) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await toggleCreditorAction({ billingEntityId, name, enabled });
          if (res.status === 'success') router.refresh();
        })
      }
      className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}
