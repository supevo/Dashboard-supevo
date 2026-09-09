'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unassignReceiptAction } from '@/features/accounting/month-clearing-actions';

/**
 * Kleiner Text-Link, um eine falsche Beleg-Zuordnung an einem Posten wieder
 * zu lösen. Bewusst dezent – kein großer Button.
 */
export function UnassignReceiptButton({ txId }: { txId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await unassignReceiptAction({ txId });
          if (res.status === 'success') router.refresh();
        })
      }
      className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
    >
      falsch? Beleg lösen
    </button>
  );
}
