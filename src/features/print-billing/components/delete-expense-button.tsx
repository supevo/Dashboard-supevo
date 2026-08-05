'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePrintExpenseAction } from '@/features/print-billing/actions';

/** Removes a print expense from the internal Ausgaben list (admin). */
export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Ausgabe löschen"
      onClick={() => {
        if (!confirm('Diese Ausgabe wirklich löschen?')) return;
        start(async () => {
          await deletePrintExpenseAction(expenseId);
          router.refresh();
        });
      }}
      className="rounded px-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-destructive"
    >
      ✕
    </button>
  );
}
