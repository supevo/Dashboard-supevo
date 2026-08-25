'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { redeemAdsCreditAction } from '@/features/billing/offer-carryover-actions';
import type { OfferCarryover } from '@/features/billing/offer-carryover';
import { formatEuroCents } from '@/lib/money';
import { Button } from '@/components/ui/button';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Zeigt die aus dem Angebot übernommenen Extras: eingelöste Gutscheine und das
 * einmalige Google-Ads-Guthaben. `canRedeem` (Agentur) blendet die Einlöse-
 * Steuerung ein; im Kundenportal ist die Karte reine Anzeige.
 */
export function OfferCarryoverCard({
  clientCompanyId,
  data,
  canRedeem = false,
}: {
  clientCompanyId: string;
  data: OfferCarryover;
  canRedeem?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasCredit = data.adsCreditCents > 0;
  const redeemed = Boolean(data.adsCreditRedeemedAt);
  if (data.promotions.length === 0 && !hasCredit) return null;

  function setRedeem(redeem: boolean) {
    setError(null);
    start(async () => {
      const res = await redeemAdsCreditAction(clientCompanyId, redeem);
      if (!res.ok) setError(res.error ?? 'Fehlgeschlagen.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">🎁 Aus dem Angebot übernommen</p>

      {data.promotions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.promotions.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              🎟️ {p.title}
              {p.discountText ? ` (${p.discountText})` : ''}
            </span>
          ))}
        </div>
      )}

      {hasCredit && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">
                {formatEuroCents(data.adsCreditCents)} Google-Ads-Guthaben
              </div>
              {redeemed ? (
                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✅ Eingelöst am {fmtDate(data.adsCreditRedeemedAt as string)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {canRedeem
                    ? 'Noch nicht eingelöst.'
                    : 'Wird von uns für Sie eingelöst.'}
                </div>
              )}
            </div>

            {canRedeem &&
              (redeemed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setRedeem(false)}
                >
                  Einlösung zurücknehmen
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => setRedeem(true)}
                >
                  Als eingelöst markieren
                </Button>
              ))}
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
