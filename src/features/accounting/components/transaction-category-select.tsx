'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTransactionCategoryAction } from '@/features/accounting/category-actions';
import { KATEGORIEN_BY_ART } from '@/features/accounting/categories';
import { Select } from '@/components/ui/select';

/**
 * Inline category picker for one transaction. A low-confidence auto-guess is
 * hinted with an amber ring so the user knows to confirm it.
 */
export function TransactionCategorySelect({
  transactionId,
  value,
  konfidenz,
}: {
  transactionId: string;
  value: string | null;
  konfidenz: number | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? '');
  const [pending, startTransition] = useTransition();

  const uncertain = value != null && konfidenz != null && konfidenz < 60;

  function onChange(next: string) {
    setCurrent(next);
    startTransition(async () => {
      await setTransactionCategoryAction({
        transactionId,
        kategorieId: next || null,
      });
      router.refresh();
    });
  }

  return (
    <Select
      value={current}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 w-auto min-w-[11rem] text-xs ${
        uncertain ? 'ring-1 ring-amber-500' : ''
      }`}
    >
      <option value="">— wählen —</option>
      {KATEGORIEN_BY_ART.map((group) => (
        <optgroup key={group.art} label={group.label}>
          {group.items.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
