'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMonthTransactionsAction } from '@/features/accounting/transaction-actions';
import { Button } from '@/components/ui/button';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Deletes all transactions of the selected period (a concrete month, or the
 * whole year when month = 0). Double confirm because it is irreversible.
 */
export function DeleteMonthTransactionsButton({
  billingEntityId,
  year,
  month,
  count,
}: {
  billingEntityId: string;
  year: number;
  month: number;
  count: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label =
    month >= 1 && month <= 12
      ? `${MONTHS[month - 1]} ${year} löschen`
      : `Alle Umsätze ${year} löschen`;

  const scope =
    month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : `das Jahr ${year}`;

  const onDelete = () => {
    setError(null);
    if (
      !window.confirm(
        `Wirklich ALLE ${count} Umsätze für ${scope} löschen? ` +
          'Das kann nicht rückgängig gemacht werden.',
      )
    ) {
      return;
    }
    start(async () => {
      const res = await deleteMonthTransactionsAction({
        billingEntityId,
        year,
        month,
      });
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onDelete}
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        🗑 {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
