'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  browseOneDriveAction,
  resolveOneDriveFolderAction,
} from '@/features/client-documents/actions';

type Item = { id: string; name: string; isFolder: boolean; webUrl: string | null };
type Crumb = { id: string | null; name: string; webUrl: string | null };

export type OneDrivePick = {
  itemId: string;
  name: string;
  webUrl: string | null;
  isFolder: boolean;
};

/**
 * Einfacher OneDrive-Browser: durch Ordner navigieren und entweder den aktuellen
 * Ordner oder eine einzelne Datei auswählen.
 */
export function OneDriveBrowser({
  onPick,
  startPath,
}: {
  onPick: (p: OneDrivePick) => void;
  /** Optionaler Startordner (z. B. "ONE STEP/Kunden"); sonst OneDrive-Root. */
  startPath?: string;
}) {
  const [stack, setStack] = useState<Crumb[]>([{ id: null, name: 'OneDrive', webUrl: null }]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Startordner einmalig auflösen und als Einstiegspunkt setzen.
  useEffect(() => {
    if (!startPath) return;
    let cancelled = false;
    (async () => {
      const res = await resolveOneDriveFolderAction(startPath);
      if (cancelled) return;
      if (res.status === 'success' && res.data?.id) {
        setStack([
          { id: null, name: 'OneDrive', webUrl: null },
          { id: res.data.id as string, name: (res.data.name as string) ?? startPath, webUrl: null },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPath]);

  const current = stack[stack.length - 1]!;

  function load(folderId: string | null) {
    setError(null);
    start(async () => {
      const res = await browseOneDriveAction(folderId);
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        setItems([]);
        return;
      }
      setItems(((res.data?.items as Item[]) ?? []).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name)));
    });
  }

  useEffect(() => {
    load(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.length]);

  function enter(it: Item) {
    setStack((s) => [...s, { id: it.id, name: it.name, webUrl: it.webUrl }]);
  }
  function goto(index: number) {
    setStack((s) => s.slice(0, index + 1));
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {stack.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button
              type="button"
              onClick={() => goto(i)}
              className="hover:text-foreground hover:underline"
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {error && <Alert variant="destructive" className="text-xs">{error}</Alert>}

      <div className="max-h-72 overflow-y-auto rounded-md border">
        {pending && <p className="p-3 text-sm text-muted-foreground">Lade …</p>}
        {!pending && items.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Dieser Ordner ist leer.</p>
        )}
        {!pending &&
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0"
            >
              {it.isFolder ? (
                <button
                  type="button"
                  onClick={() => enter(it)}
                  className="flex min-w-0 items-center gap-2 text-left text-sm hover:underline"
                >
                  <span>📁</span>
                  <span className="truncate">{it.name}</span>
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span>📄</span>
                  <span className="truncate">{it.name}</span>
                </span>
              )}
              {!it.isFolder && (
                <button
                  type="button"
                  onClick={() =>
                    onPick({ itemId: it.id, name: it.name, webUrl: it.webUrl, isFolder: false })
                  }
                  className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-muted"
                >
                  Diese Datei wählen
                </button>
              )}
            </div>
          ))}
      </div>

      {current.id && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onPick({ itemId: current.id!, name: current.name, webUrl: current.webUrl, isFolder: true })
          }
        >
          📁 Diesen Ordner wählen: {current.name}
        </Button>
      )}
    </div>
  );
}
