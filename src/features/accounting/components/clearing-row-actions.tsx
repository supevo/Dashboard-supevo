'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  searchReceiptsAction,
  assignReceiptAction,
  browseOneDriveAction,
  assignOneDriveFileAction,
} from '@/features/accounting/month-clearing-actions';
import type {
  ReceiptSearchHit,
  OneDriveEntry,
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
  const [busy, startBusy] = useTransition();

  // OneDrive-Ordner-Browser: Stack der betretenen Ordner (erster = Wurzel mit
  // Beleg-Art), plus die aktuell gelisteten Einträge. null = Browser geschlossen.
  type Crumb = { id: string; name: string; kind?: 'einnahmen' | 'ausgaben' };
  const [stack, setStack] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<OneDriveEntry[] | null>(null);
  const [odError, setOdError] = useState<string | null>(null);

  const currentKind = stack.find((c) => c.kind)?.kind ?? 'ausgaben';
  // Ordnerpfad unter der Wurzel (für die Monatszuordnung, z. B. „2026/08. August").
  const folderPath = stack.slice(1).map((c) => c.name).join('/');

  function search() {
    startBusy(async () => {
      const res = await searchReceiptsAction({ billingEntityId, query: q });
      setHits(res.ok ? (res.hits ?? []) : []);
    });
  }

  function loadFolder(nextStack: Crumb[]) {
    const folderId = nextStack.length ? nextStack[nextStack.length - 1]!.id : undefined;
    startBusy(async () => {
      const res = await browseOneDriveAction({ billingEntityId, folderId });
      if (res.ok) {
        setEntries(res.entries ?? []);
        setStack(nextStack);
        setOdError(null);
      } else {
        setOdError(res.error ?? 'Fehler');
        setEntries([]);
      }
    });
  }

  function openBrowser() {
    loadFolder([]);
  }
  function enterFolder(e: OneDriveEntry) {
    loadFolder([...stack, { id: e.id, name: e.name, kind: e.kind }]);
  }
  function goUp() {
    loadFolder(stack.slice(0, -1));
  }
  function closeBrowser() {
    setEntries(null);
    setStack([]);
    setOdError(null);
  }

  function assign(receiptId: string) {
    startBusy(async () => {
      const res = await assignReceiptAction({ txId, receiptId });
      if (res.status === 'success') router.refresh();
    });
  }

  function pickFile(e: OneDriveEntry) {
    startBusy(async () => {
      const res = await assignOneDriveFileAction({
        txId,
        billingEntityId,
        itemId: e.id,
        fileName: e.name,
        kind: currentKind,
        folder: folderPath,
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

          {hits && hits.length === 0 && entries === null && (
            <p className="text-xs text-muted-foreground">
              Kein importierter Beleg gefunden. Unten im OneDrive-Ordner
              nachsehen und die Datei selbst wählen.
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

          {/* OneDrive-Ordner selbst durchblättern und die Datei wählen. */}
          {entries === null ? (
            <button
              type="button"
              disabled={busy}
              onClick={openBrowser}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              🗂️ OneDrive-Ordner durchsuchen …
            </button>
          ) : (
            <div className="space-y-1.5 rounded-md border bg-background/60 p-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={busy || stack.length === 0}
                  onClick={goUp}
                  className="h-7 px-2"
                >
                  ← zurück
                </Button>
                <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {stack.length === 0
                    ? 'OneDrive – Ordner wählen'
                    : stack.map((c) => c.name).join(' / ')}
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={closeBrowser}
                  className="h-7 px-2"
                >
                  Zu
                </Button>
              </div>

              {odError && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{odError}</p>
              )}
              {!odError && entries.length === 0 && (
                <p className="text-xs text-muted-foreground">Ordner ist leer.</p>
              )}

              <ul className="max-h-64 divide-y overflow-y-auto">
                {entries.map((e) =>
                  e.isFolder ? (
                    <li key={e.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => enterFolder(e)}
                        className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-primary disabled:opacity-50"
                      >
                        <span>📁</span>
                        <span className="truncate">{e.name}</span>
                        <span className="ml-auto text-muted-foreground">›</span>
                      </button>
                    </li>
                  ) : (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span>📄</span>
                        <span className="truncate text-sm">{e.name}</span>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => pickFile(e)}
                      >
                        Wählen
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
