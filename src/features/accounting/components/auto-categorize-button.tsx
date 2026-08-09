'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoCategorizeAction } from '@/features/accounting/category-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** Runs the rule-based auto-categorization over a company's open transactions. */
export function AutoCategorizeButton({
  billingEntityId,
}: {
  billingEntityId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await autoCategorizeAction(billingEntityId);
    setBusy(false);
    setMsg('message' in res ? (res.message ?? '') : '');
    if (res.status === 'success') router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? 'Kategorisiere …' : '✨ Auto-kategorisieren'}
      </Button>
      {msg && (
        <Alert className="py-1 text-xs">{msg}</Alert>
      )}
    </div>
  );
}
