'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setClientFolderAction,
  clearClientFolderAction,
} from '@/features/onedrive/actions';
import { OneDriveBrowser } from '@/features/onedrive/components/onedrive-browser';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Admin control on the client detail page: link this client company to a folder
 * in the connected OneDrive. Uploaded task files are then mirrored there, and
 * the folder is the browse root when attaching from OneDrive.
 */
export function ClientFolderLink({
  clientCompanyId,
  currentPath,
  connected,
}: {
  clientCompanyId: string;
  currentPath: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Zuerst muss in den Einstellungen ein OneDrive-Konto verbunden werden.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="destructive">{error}</Alert>}
      <p className="text-sm">
        {currentPath ? (
          <>
            Verknüpfter Ordner: <span className="font-medium">{currentPath}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Noch kein Ordner verknüpft.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {currentPath ? 'Ordner ändern' : 'OneDrive-Ordner verknüpfen'}
        </Button>
        {currentPath && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearClientFolderAction(clientCompanyId);
                router.refresh();
              })
            }
          >
            Entfernen
          </Button>
        )}
      </div>

      <OneDriveBrowser
        open={open}
        onClose={() => setOpen(false)}
        mode="folder"
        title="Kundenordner in OneDrive wählen"
        busy={pending}
        onPickFolder={(folder) => {
          if (!folder.id) return;
          setError(null);
          start(async () => {
            const res = await setClientFolderAction({
              clientCompanyId,
              folderId: folder.id as string,
              folderPath: folder.name,
            });
            if (res.status === 'error') {
              setError(res.message);
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      />
    </div>
  );
}
