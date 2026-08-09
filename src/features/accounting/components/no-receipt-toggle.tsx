'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setBelegNichtNoetigAction } from '@/features/accounting/month-close-actions';

/** Toggles a booking's "kein Beleg nötig" flag from the gap / intentional list. */
export function NoReceiptToggle({
  transactionId,
  value,
}: {
  transactionId: string;
  value: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await setBelegNichtNoetigAction({
      transactionId,
      value: !value,
    });
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="text-xs text-primary hover:underline disabled:opacity-50"
    >
      {value ? 'Beleg doch nötig' : 'kein Beleg nötig'}
    </button>
  );
}
