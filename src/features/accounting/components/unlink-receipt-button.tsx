'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unlinkReceiptAction } from '@/features/accounting/receipt-actions';

/** Hebt die Zuordnung eines Belegs auf, damit er neu abgeglichen werden kann. */
export function UnlinkReceiptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await unlinkReceiptAction(id);
          router.refresh();
        })
      }
      title="Zuordnung aufheben – Beleg wird wieder im Abgleich angeboten"
      className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-40"
    >
      Zuordnung aufheben
    </button>
  );
}
