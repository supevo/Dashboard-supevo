'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { idleResult } from '@/lib/action-result';
import {
  uploadClientDocumentAction,
  attachOneDriveDocumentAction,
  removeClientDocumentAction,
  clientDocumentUrlAction,
} from '@/features/client-documents/actions';
import type { ClientDocument, DocKind } from '@/features/client-documents/queries';
import { OneDriveBrowser, type OneDrivePick } from './onedrive-browser';

const SOURCE_LABEL: Record<string, string> = {
  upload: 'Hochgeladen',
  onedrive_folder: 'OneDrive-Ordner',
  onedrive_file: 'OneDrive-Datei',
};

/**
 * Dokument-Slot (SEPA-Mandat / Vertrag): zeigt das aktuell hinterlegte Dokument
 * und erlaubt Upload, OneDrive-Ordner-Auswahl oder OneDrive-Datei-Auswahl.
 */
export function DocumentSlot({
  clientCompanyId,
  kind,
  label,
  current,
  oneDriveStartPath = 'ONE STEP/Kunden',
}: {
  clientCompanyId: string;
  kind: DocKind;
  label: string;
  current: ClientDocument | null;
  /** OneDrive-Startordner für die Auswahl. */
  oneDriveStartPath?: string;
}) {
  const router = useRouter();
  const [browsing, setBrowsing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploadState, uploadAction] = useActionState(uploadClientDocumentAction, idleResult);

  useEffect(() => {
    if (uploadState.status === 'success') {
      setMsg(uploadState.message ?? null);
      router.refresh();
    }
  }, [uploadState, router]);

  function pickOneDrive(p: OneDrivePick) {
    setBrowsing(false);
    start(async () => {
      const res = await attachOneDriveDocumentAction({
        clientCompanyId,
        kind,
        itemId: p.itemId,
        name: p.name,
        webUrl: p.webUrl ?? '',
        isFolder: p.isFolder,
      });
      setMsg('message' in res ? res.message ?? '' : '');
      if (res.status === 'success') router.refresh();
    });
  }
  function remove() {
    start(async () => {
      await removeClientDocumentAction(clientCompanyId, kind);
      router.refresh();
    });
  }
  function open() {
    if (!current) return;
    start(async () => {
      const res = await clientDocumentUrlAction(current.id);
      if (res.status === 'success' && res.data?.url) {
        window.open(res.data.url as string, '_blank', 'noopener');
      } else {
        setMsg((('message' in res && res.message) || 'Link nicht verfügbar.') as string);
      }
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {current && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {SOURCE_LABEL[current.source] ?? current.source}
          </span>
        )}
      </div>

      {current ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm text-muted-foreground">📎 {current.name}</span>
          <button type="button" onClick={open} disabled={pending} className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
            Öffnen
          </button>
          <button type="button" onClick={remove} disabled={pending} className="rounded border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
            Entfernen
          </button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Noch nichts hinterlegt.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
        <form action={uploadAction} className="flex items-center gap-2">
          <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
          <input type="hidden" name="kind" value={kind} />
          <input
            type="file"
            name="file"
            required
            className="max-w-[220px] text-xs file:mr-2 file:rounded file:border file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
          <SubmitButton variant="outline" size="sm">Hochladen</SubmitButton>
        </form>
        <span className="text-xs text-muted-foreground">oder</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setBrowsing(true)}>
          Aus OneDrive wählen
        </Button>
      </div>

      {uploadState.status === 'error' && (
        <Alert variant="destructive" className="mt-2 text-xs">{uploadState.message}</Alert>
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}

      <Modal open={browsing} onClose={() => setBrowsing(false)} title={`${label}: aus OneDrive wählen`}>
        <OneDriveBrowser onPick={pickOneDrive} startPath={oneDriveStartPath} />
      </Modal>
    </div>
  );
}
