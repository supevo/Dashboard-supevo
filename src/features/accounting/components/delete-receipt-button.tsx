'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteReceiptAction } from '@/features/accounting/receipt-actions';

/** Small ✕ button to delete one receipt (with confirm) – for stray/duplicate rows. */
export function DeleteReceiptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onDelete = () => {
    if (
      !window.confirm(
        'Diesen Beleg-Datensatz löschen? (Die Datei in OneDrive bleibt erhalten.)',
      )
    ) {
      return;
    }
    start(async () => {
      await deleteReceiptAction(id);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onDelete}
      aria-label="Beleg löschen"
      title="Beleg-Datensatz löschen"
      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
    >
      ✕
    </button>
  );
}
