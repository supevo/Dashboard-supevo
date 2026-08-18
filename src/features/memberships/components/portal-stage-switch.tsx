'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { formatEuroCents } from '@/lib/money';
import { savePortalStageAction } from '@/features/memberships/configurator-actions';

/**
 * supevo-Portal: Selbstwechsel zwischen Stage 1 und 2. Gilt ab dem Folgemonat.
 */
export function PortalStageSwitch({
  currentStage,
  stage1Cents,
  stage2Cents,
  pending,
}: {
  currentStage: number;
  stage1Cents: number;
  stage2Cents: number;
  pending: { stage: number; effectiveDate: string; netCents: number } | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingReq, start] = useTransition();

  const other = currentStage === 2 ? 1 : 2;
  const otherCents = other === 2 ? stage2Cents : stage1Cents;

  function switchTo(stage: number) {
    setMsg(null);
    start(async () => {
      const res = await savePortalStageAction({ stage });
      setMsg('message' in res ? res.message ?? '' : '');
      if (res.status === 'success') router.refresh();
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm font-medium">Ihre Stufe</div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Aktuell: <strong>supevo Stage {currentStage}</strong>. Sie können jederzeit
        wechseln – die Änderung gilt ab dem Folgemonat.
      </p>

      {pending && (
        <Alert className="mt-2 text-xs">
          📅 Geplant: Wechsel auf <strong>Stage {pending.stage}</strong> (
          {formatEuroCents(pending.netCents)} netto) ab {pending.effectiveDate}.
        </Alert>
      )}

      <div className="mt-3">
        <Button type="button" onClick={() => switchTo(other)} disabled={pendingReq}>
          {pendingReq
            ? 'Wird geplant …'
            : `Zu Stage ${other} wechseln (${formatEuroCents(otherCents)} netto/Monat)`}
        </Button>
      </div>

      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
