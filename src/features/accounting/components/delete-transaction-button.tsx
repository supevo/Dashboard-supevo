'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTransactionAction } from '@/features/accounting/transaction-actions';

/** Small ✕ button to delete one bank transaction (with confirm). */
export function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onDelete = () => {
    if (!window.confirm('Diesen Umsatz löschen?')) return;
    start(async () => {
      await deleteTransactionAction(id);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onDelete}
      aria-label="Umsatz löschen"
      title="Umsatz löschen"
      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
    >
      ✕
    </button>
  );
}
