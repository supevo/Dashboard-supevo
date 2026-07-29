'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markRedemptionFulfilledAction } from '@/features/loot/actions';
import type { Redemption } from '@/features/loot/queries';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const TIER_LABEL: Record<string, string> = {
  common: '📦 Common',
  rare: '🎁 Rare',
  super: '💎 Super Rare',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Admin overview of who redeemed which physical reward. Splits into open
 * (waiting to be handed over) and already fulfilled, and lets the admin close
 * an open one with one click.
 */
export function RedemptionsAdmin({ redemptions }: { redemptions: Redemption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = redemptions.filter((r) => r.status === 'requested');
  const done = redemptions.filter((r) => r.status === 'fulfilled');

  function markDone(id: string) {
    setError(null);
    start(async () => {
      const res = await markRedemptionFulfilledAction(id);
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });
  }

  if (redemptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine eingelösten Items. Sobald ein Mitarbeiter im Level Hub eine physische Belohnung
        einlöst, erscheint sie hier – inklusive Name.
      </p>
    );
  }

  const row = (r: Redemption) => (
    <li key={r.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
      {r.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted"
          aria-hidden
        >
          🎁
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{r.userName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {r.itemName}
          {r.boxTier ? ` · ${TIER_LABEL[r.boxTier] ?? r.boxTier}` : ''} · {fmtDate(r.redeemedAt)}
        </div>
      </div>
      {r.status === 'requested' ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => markDone(r.id)}>
          Erledigt ✓
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-emerald-500">erledigt ✓</span>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="space-y-2">
        <div className="text-sm font-semibold">Offen ({open.length})</div>
        {open.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine offenen Einlösungen.</p>
        ) : (
          <ul className="space-y-1.5">{open.map(row)}</ul>
        )}
      </div>

      {done.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Erledigt ({done.length})</div>
          <ul className="space-y-1.5">{done.map(row)}</ul>
        </div>
      )}
    </div>
  );
}
