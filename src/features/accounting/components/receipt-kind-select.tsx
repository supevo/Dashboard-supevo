'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setReceiptKindAction } from '@/features/accounting/receipt-actions';

/** Inline Einnahme/Ausgabe switch for a single receipt. */
export function ReceiptKindSelect({
  receiptId,
  value,
}: {
  receiptId: string;
  value: 'einnahme' | 'ausgabe';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onChange = (kind: 'einnahme' | 'ausgabe') => {
    if (kind === value) return;
    start(async () => {
      await setReceiptKindAction({ receiptId, kind });
      router.refresh();
    });
  };

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value as 'einnahme' | 'ausgabe')}
      className="rounded-md border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
      title="Einnahme / Ausgabe"
    >
      <option value="einnahme">⬆️ Einnahme</option>
      <option value="ausgabe">⬇️ Ausgabe</option>
    </select>
  );
}
