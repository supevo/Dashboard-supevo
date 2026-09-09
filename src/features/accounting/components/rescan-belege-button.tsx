'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rescanBelegeAction } from '@/features/accounting/month-clearing-actions';
import { Button } from '@/components/ui/button';

/**
 * „Belege neu prüfen": scannt die OneDrive-Ordner erneut, damit nachträglich
 * abgelegte Belege reinkommen und offene Posten neu zugeordnet werden können.
 */
export function RescanBelegeButton({
  billingEntityId,
}: {
  billingEntityId: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function run() {
    setMsg(null);
    start(async () => {
      const res = await rescanBelegeAction({ billingEntityId });
      setMsg(res.status === 'success' ? (res.message ?? 'Fertig.') : res.status === 'error' ? res.message : null);
      if (res.status === 'success') router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" type="button" variant="outline" disabled={busy} onClick={run}>
        {busy ? '🔄 Prüfe …' : '🔄 Belege neu prüfen'}
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </span>
  );
}
