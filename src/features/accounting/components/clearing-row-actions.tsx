'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  searchReceiptsAction,
  assignReceiptAction,
  searchOneDriveFilesAction,
  assignOneDriveFileAction,
} from '@/features/accounting/month-clearing-actions';
import type {
  ReceiptSearchHit,
  OneDriveFileHit,
  ClearingSuggestion,
} from '@/features/accounting/month-clearing-queries';
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
  suggestions = [],
  showNoReceipt = true,
  searchLabel = '📎 Beleg suchen …',
}: {
  txId: string;
  billingEntityId: string;
  defaultQuery?: string;
  suggestions?: ClearingSuggestion[];
  showNoReceipt?: boolean;
  searchLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery);
  const [hits, setHits] = useState<ReceiptSearchHit[] | null>(null);
  const [odHits, setOdHits] = useState<OneDriveFileHit[] | null>(null);
  const [busy, startBusy] = useTransition();

  function search() {
    startBusy(async () => {
      const res = await searchReceiptsAction({ billingEntityId, query: q });
      setHits(res.ok ? (res.hits ?? []) : []);
      setOdHits(null);
    });
  }

  function searchOneDrive() {
    startBusy(async () => {
      const res = await searchOneDriveFilesAction({ billingEntityId, query: q });
      setOdHits(res.ok ? (res.hits ?? []) : []);
    });
  }

  function assign(receiptId: string) {
    startBusy(async () => {
      const res = await assignReceiptAction({ txId, receiptId });
      if (res.status === 'success') router.refresh();
    });
  }

  function assignOd(f: OneDriveFileHit) {
    startBusy(async () => {
      const res = await assignOneDriveFileAction({
        txId,
        billingEntityId,
        itemId: f.itemId,
        fileName: f.fileName,
        kind: f.kind,
        folder: f.folder,
      });
      if (res.status === 'success') router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <div
              key={s.receiptId}
              className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/[0.06] px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">
                  Vorschlag: {s.label || s.fileName}{' '}
                  <span className="text-muted-foreground">· {s.scorePct}%</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {s.reason} · 🧾 {s.fileName}
                </div>
              </div>
              <Button
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => assign(s.receiptId)}
              >
                Zuordnen
              </Button>
            </div>
          ))}
        </div>
      )}

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
            {searchLabel}
          </Button>
        )}
        {showNoReceipt && <NoReceiptToggle transactionId={txId} value={false} />}
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

          {hits && hits.length === 0 && odHits === null && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Kein importierter Beleg gefunden. Direkt in OneDrive suchen –
                auch Dateien, die noch nicht importiert wurden:
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={searchOneDrive}
              >
                🗂️ In OneDrive suchen
              </Button>
            </div>
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
              <li className="pt-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={searchOneDrive}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Nicht dabei? 🗂️ Direkt in OneDrive suchen …
                </button>
              </li>
            </ul>
          )}

          {odHits !== null && (
            <div className="space-y-1.5 border-t pt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                OneDrive-Dateien
              </p>
              {odHits.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine Datei in OneDrive gefunden. Suchbegriff anpassen oder oben
                  &bdquo;🔄 Belege neu prüfen&ldquo;.
                </p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto">
                  {odHits.map((f) => (
                    <li
                      key={f.itemId}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{f.fileName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {f.kind === 'einnahmen' ? '📥 Einnahmen' : '📤 Ausgaben'}
                          {f.folder ? ` · ${f.folder}` : ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => assignOd(f)}
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
      )}
    </div>
  );
}
