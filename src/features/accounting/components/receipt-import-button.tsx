'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  importOneDriveReceiptsAction,
  listReceiptSubfoldersAction,
} from '@/features/accounting/receipt-actions';
import { useReceiptExtraction } from '@/features/accounting/components/use-receipt-extraction';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

type Subfolder = { id: string; name: string; childCount: number | null };
type Crumb = { id: string | null; name: string };

/** Triggers a OneDrive scan+import for one company/folder (Einnahmen/Ausgaben).
 *  A small folder navigator lets the user drill into nested subfolders and
 *  import just one (e.g. a single month). Import auto-reads the new receipts. */
export function ReceiptImportButton({
  billingEntityId,
  kind,
  linked,
}: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
  linked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [folders, setFolders] = useState<Subfolder[] | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  // Breadcrumb of the folders we drilled into. First = linked root (id null).
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: 'Hauptordner' }]);
  const current = path[path.length - 1]!;
  const { busy: extracting, msg: extractMsg, runAll } =
    useReceiptExtraction(billingEntityId);

  const loadFolders = useCallback(
    async (folderId: string | null) => {
      setLoadingFolders(true);
      try {
        const res = await listReceiptSubfoldersAction({
          billingEntityId,
          kind,
          folderId: folderId ?? undefined,
        });
        setFolders(res.ok && res.folders ? res.folders : []);
      } finally {
        setLoadingFolders(false);
      }
    },
    [billingEntityId, kind],
  );

  useEffect(() => {
    if (!linked) return;
    void loadFolders(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, current.id, loadFolders]);

  function enter(f: Subfolder) {
    setPath((p) => [...p, { id: f.id, name: f.name }]);
  }
  function jumpTo(index: number) {
    setPath((p) => p.slice(0, index + 1));
  }

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await importOneDriveReceiptsAction({
      billingEntityId,
      kind,
      subfolderId: current.id ?? undefined,
    });
    setBusy(false);
    const text = 'message' in res ? (res.message ?? '') : '';
    setMsg({ ok: res.status === 'success', text });
    if (res.status === 'success') {
      router.refresh();
      const imported =
        res.status === 'success' && typeof res.data?.imported === 'number'
          ? res.data.imported
          : 0;
      if (imported > 0) await runAll();
    }
  }

  const label = kind === 'einnahmen' ? 'Einnahmen' : 'Ausgaben';
  const inSubfolder = current.id !== null;

  return (
    <div className="space-y-2">
      {linked && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Ordnerauswahl</div>
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {path.map((c, i) => (
              <span key={`${c.id ?? 'root'}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">›</span>}
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  disabled={busy || extracting}
                  className={
                    i === path.length - 1
                      ? 'font-medium text-foreground'
                      : 'text-primary hover:underline'
                  }
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          {/* Subfolders to drill into */}
          {loadingFolders ? (
            <div className="text-xs text-muted-foreground">Ordner werden geladen …</div>
          ) : folders && folders.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => enter(f)}
                  disabled={busy || extracting}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
                  title="In diesen Unterordner wechseln"
                >
                  📁 {f.name}
                  {f.childCount != null ? ` (${f.childCount})` : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={busy || extracting || !linked}
      >
        {busy
          ? 'Scanne …'
          : extracting
            ? 'Lese aus …'
            : `📥 ${inSubfolder ? `„${current.name}"` : label} importieren & auslesen`}
      </Button>

      {!linked && (
        <p className="text-xs text-muted-foreground">
          Kein {label}-Ordner verknüpft (Tab „Firmen“).
        </p>
      )}
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'}>{msg.text}</Alert>
      )}
      {extractMsg && (
        <Alert
          variant={extractMsg.ok ? 'default' : 'destructive'}
          className="py-1 text-xs"
        >
          🤖 {extractMsg.text}
        </Alert>
      )}
    </div>
  );
}
