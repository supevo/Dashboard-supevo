'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setEntityFolderAction,
  clearEntityFolderAction,
} from '@/features/accounting/actions';
import { OneDriveBrowser } from '@/features/onedrive/components/onedrive-browser';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Links a OneDrive folder (Einnahmen or Ausgaben) to a company. OneDrive is the
 * source of truth for the documents; the accounting module reads existing files
 * from here and writes new ones back (Phase 2+).
 */
export function CompanyFolderLink({
  billingEntityId,
  kind,
  currentPath,
  currentId,
}: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
  currentPath: string | null;
  currentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = kind === 'einnahmen' ? 'Einnahmen-Ordner' : 'Ausgaben-Ordner';

  async function pick(item: { id: string | null; name: string }) {
    if (!item.id) return;
    setBusy(true);
    setError(null);
    const res = await setEntityFolderAction({
      billingEntityId,
      kind,
      folderId: item.id,
      folderPath: item.name,
    });
    setBusy(false);
    setOpen(false);
    if (res.status === 'error') setError(res.message);
    else router.refresh();
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    const res = await clearEntityFolderAction({ billingEntityId, kind });
    setBusy(false);
    if (res.status === 'error') setError(res.message);
    else router.refresh();
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {currentId ? (
            <p className="truncate text-xs text-muted-foreground">
              📁 {currentPath || 'Verknüpft'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Nicht verknüpft</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={busy}
          >
            {currentId ? 'Ändern' : 'Ordner wählen'}
          </Button>
          {currentId && (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Entfernen
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-2">
          {error}
        </Alert>
      )}

      <OneDriveBrowser
        open={open}
        onClose={() => setOpen(false)}
        mode="folder"
        title={`${title} wählen`}
        onPickFolder={pick}
        busy={busy}
        scope="full"
      />
    </div>
  );
}
