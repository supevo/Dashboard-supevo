'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatEuroCents } from '@/lib/money';
import {
  savePortalStageAction,
  cancelPortalPendingChangeAction,
} from '@/features/memberships/configurator-actions';

function BenefitList({ benefits }: { benefits: string[] }) {
  if (benefits.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {benefits.map((b) => (
        <li key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * supevo-Portal: EINZIGER Bereich für die Mitgliedschaft. Zeigt beide Stufen
 * (Name/Preis/Leistungen aus den Billing-Settings) und lässt den Kunden zwischen
 * Stage 1 und 2 wechseln – der Wechsel gilt immer ab dem Folgemonat.
 */
export function PortalStageSwitch({
  currentStage,
  stage1Name,
  stage2Name,
  stage1Cents,
  stage2Cents,
  stage1Benefits,
  stage2Benefits,
  pending,
}: {
  currentStage: number;
  stage1Name: string;
  stage2Name: string;
  stage1Cents: number;
  stage2Cents: number;
  stage1Benefits: string[];
  stage2Benefits: string[];
  pending: { stage: number; effectiveDate: string; netCents: number } | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [confirmStage, setConfirmStage] = useState<number | null>(null);

  function switchTo(stage: number) {
    setMsg(null);
    setConfirmStage(null);
    start(async () => {
      const res = await savePortalStageAction({ stage });
      setMsg('message' in res ? res.message ?? '' : '');
      if (res.status === 'success') router.refresh();
    });
  }

  function cancelPending() {
    setMsg(null);
    start(async () => {
      const res = await cancelPortalPendingChangeAction();
      setMsg('message' in res ? res.message ?? '' : '');
      if (res.status === 'success') router.refresh();
    });
  }

  const cards = [
    { stage: 1, name: stage1Name, cents: stage1Cents, benefits: stage1Benefits },
    { stage: 2, name: stage2Name, cents: stage2Cents, benefits: stage2Benefits },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sie können jederzeit die Stufe wechseln. Die Änderung gilt ab dem
        Folgemonat.
      </p>

      {pending && (
        <Alert className="text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              📅 Geplant: Wechsel auf <strong>Stage {pending.stage}</strong> (
              {formatEuroCents(pending.netCents)} netto) ab {pending.effectiveDate}
              .
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={cancelPending}
            >
              {busy ? 'Wird verworfen …' : 'Wechsel abbrechen'}
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const current = currentStage === c.stage;
          const isPendingTarget = pending?.stage === c.stage;
          return (
            <div
              key={c.stage}
              className={cn(
                'flex flex-col rounded-lg border p-4',
                current && 'border-primary ring-1 ring-primary',
              )}
            >
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="mt-1 text-2xl font-bold">
                {formatEuroCents(c.cents)}
              </div>
              <div className="text-xs text-muted-foreground">
                zzgl. MwSt / Monat
              </div>

              <BenefitList benefits={c.benefits} />

              <div className="mt-auto pt-3">
                {current ? (
                  <span className="inline-block rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Ihr aktuelles Paket
                  </span>
                ) : confirmStage === c.stage ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Wechsel auf <strong>{c.name}</strong> ({formatEuroCents(c.cents)}{' '}
                      netto/Monat) ab dem Folgemonat wirklich einplanen?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => switchTo(c.stage)}
                      >
                        {busy ? 'Wird geplant …' : 'Ja, wechseln'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirmStage(null)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || isPendingTarget}
                    onClick={() => setConfirmStage(c.stage)}
                  >
                    {isPendingTarget ? 'Wechsel geplant' : `Zu ${c.name} wechseln`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
