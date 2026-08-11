'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  importOneDriveReceiptsAction,
  listReceiptSubfoldersAction,
} from '@/features/accounting/receipt-actions';
import { useReceiptExtraction } from '@/features/accounting/components/use-receipt-extraction';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';

type Subfolder = { id: string; name: string; childCount: number | null };

/** Triggers a OneDrive scan+import for one company/folder (Einnahmen/Ausgaben).
 *  Optionally narrows the import to a single subfolder (e.g. one month). */
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
  const [sub, setSub] = useState(''); // '' = ganzer Ordner
  const [loadingFolders, setLoadingFolders] = useState(false);
  // KI-Auslesen direkt nach dem Import (dieselbe Schleife wie der Auslese-Button).
  const { busy: extracting, msg: extractMsg, runAll } = useReceiptExtraction(
    billingEntityId,
  );

  // Unterordner des verknüpften Ordners laden (nachträglich, blockiert die
  // Seite nicht). Bei Fehler bleibt nur „ganzer Ordner".
  useEffect(() => {
    if (!linked) return;
    let active = true;
    setLoadingFolders(true);
    listReceiptSubfoldersAction({ billingEntityId, kind })
      .then((res) => {
        if (!active) return;
        if (res.ok && res.folders) setFolders(res.folders);
      })
      .finally(() => {
        if (active) setLoadingFolders(false);
      });
    return () => {
      active = false;
    };
  }, [billingEntityId, kind, linked]);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await importOneDriveReceiptsAction({
      billingEntityId,
      kind,
      subfolderId: sub || undefined,
    });
    setBusy(false);
    const text = 'message' in res ? (res.message ?? '') : '';
    setMsg({ ok: res.status === 'success', text });
    if (res.status === 'success') {
      router.refresh();
      // Neu importierte Belege gleich mit KI auslesen – kein zweiter Klick nötig.
      const imported =
        res.status === 'success' && typeof res.data?.imported === 'number'
          ? res.data.imported
          : 0;
      if (imported > 0) await runAll();
    }
  }

  const label = kind === 'einnahmen' ? 'Einnahmen' : 'Ausgaben';

  return (
    <div className="space-y-2">
      {linked && folders && folders.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Ordnerauswahl
          </label>
          <Select
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className="h-9 w-full"
            aria-label="Unterordner"
            disabled={busy}
          >
            <option value="">Ganzer Ordner (alle Unterordner)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.childCount != null ? ` (${f.childCount})` : ''}
              </option>
            ))}
          </Select>
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
            : `📥 ${label}${sub ? ' (Unterordner)' : ''} aus OneDrive importieren & auslesen`}
      </Button>

      {loadingFolders && (
        <p className="text-xs text-muted-foreground">Unterordner werden geladen …</p>
      )}
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
