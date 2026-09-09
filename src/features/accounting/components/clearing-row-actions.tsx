'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  searchReceiptsAction,
  assignReceiptAction,
} from '@/features/accounting/month-clearing-actions';
import type { ReceiptSearchHit } from '@/features/accounting/month-clearing-queries';
import { NoReceiptToggle } from '@/features/accounting/components/no-receipt-toggle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatEuroCents } from '@/lib/money';

/**
 * Aktionen an einem Posten ohne Beleg: den Beleg über eine Datei-Suche händisch
 * zuordnen (der genaue „Notstep"), oder als „kein Beleg nötig" mit Grund
 * markieren. Der globale „neu prüfen"-Scan sitzt im Panel-Kopf.
 */
export function ClearingRowActions({
  txId,
  billingEntityId,
  defaultQuery = '',
}: {
  txId: string;
  billingEntityId: string;
  defaultQuery?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery);
  const [hits, setHits] = useState<ReceiptSearchHit[] | null>(null);
  const [busy, startBusy] = useTransition();

  function search() {
    startBusy(async () => {
      const res = await searchReceiptsAction({ billingEntityId, query: q });
      setHits(res.ok ? (res.hits ?? []) : []);
    });
  }

  function assign(receiptId: string) {
    startBusy(async () => {
      const res = await assignReceiptAction({ txId, receiptId });
      if (res.status === 'success') router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!open && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(true);
              if (hits === null) search();
            }}
          >
            📎 Beleg suchen …
          </Button>
        )}
        <NoReceiptToggle transactionId={txId} value={false} />
      </div>

      {open && (
        <div className="space-y-2 rounded-md border bg-background/60 p-2.5">
          <div className="flex gap-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
              placeholder="Dateiname oder Händler …"
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" type="button" disabled={busy} onClick={search}>
              Suchen
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Zu
            </Button>
          </div>

          {hits && hits.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Kein Beleg gefunden. Ggf. oben &bdquo;🔄 Belege neu prüfen&ldquo;
              oder als &bdquo;kein Beleg nötig&ldquo; markieren.
            </p>
          )}
          {hits && hits.length > 0 && (
            <ul className="max-h-56 divide-y overflow-y-auto">
              {hits.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{h.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        h.haendler,
                        h.datum
                          ? new Date(h.datum).toLocaleDateString('de-DE')
                          : null,
                        h.bruttoCents != null
                          ? formatEuroCents(Math.abs(h.bruttoCents))
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => assign(h.id)}
                  >
                    Zuordnen
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
