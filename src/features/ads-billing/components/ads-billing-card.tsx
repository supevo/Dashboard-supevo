'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  confirmAdsWeBillAction,
  markAdsSelfPaidAction,
  dismissAdsBillingAction,
} from '@/features/ads-billing/actions';

/**
 * Rückfrage auf der Aufgabe, wenn Meta/Google Ads erkannt wurden: „Werden Ads
 * geschaltet und wer zahlt das Budget?". Bei „wir legen aus" entsteht ein
 * laufendes Ads-Mandat (Meta/Google getrennt), das monatlich abgerechnet wird.
 */
export function AdsBillingCard({
  taskId,
  status,
}: {
  taskId: string;
  status: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  if (!status || status === 'dismissed') return null;

  function run(fn: () => Promise<{ status: string }>) {
    start(async () => {
      const res = await fn();
      if (res.status === 'success') router.refresh();
    });
  }

  if (status === 'confirmed') {
    return (
      <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/[0.06] p-3 text-sm">
        <div className="font-medium text-sky-700 dark:text-sky-300">
          📣 Ads-Mandat aktiv – Budget wird von uns ausgelegt, läuft monatlich.
        </div>
        <p className="text-xs text-muted-foreground">
          Zweite Plattform noch ergänzen? Sonst{' '}
          <Link href="/app/ads" className="text-primary hover:underline">
            zur Ads-Übersicht
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => confirmAdsWeBillAction({ taskId, platform: 'meta' }))}
          >
            + Meta
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => confirmAdsWeBillAction({ taskId, platform: 'google' }))}
          >
            + Google
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'self_paid') {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        📣 Ads: Kunde zahlt selbst – keine Weiterberechnung.
      </div>
    );
  }

  // status === 'required' → Rückfrage.
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 text-sm">
      <div className="font-medium">📣 Werden hier Ads geschaltet? Wer zahlt das Budget?</div>
      <p className="text-xs text-muted-foreground">
        Wenn wir das Budget auslegen, wird daraus ein laufendes Mandat mit
        monatlicher Abrechnung (Verbrauch eintragen + Kundenpauschale).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          type="button"
          disabled={busy}
          onClick={() => run(() => confirmAdsWeBillAction({ taskId, platform: 'meta' }))}
        >
          Wir zahlen · Meta
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={busy}
          onClick={() => run(() => confirmAdsWeBillAction({ taskId, platform: 'google' }))}
        >
          Wir zahlen · Google
        </Button>
        <Button
          size="sm"
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => markAdsSelfPaidAction({ taskId }))}
        >
          Kunde zahlt selbst
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => dismissAdsBillingAction({ taskId }))}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          Kein Ads
        </button>
      </div>
    </div>
  );
}
