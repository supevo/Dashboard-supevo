'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { attachOneDriveFileAction } from '@/features/onedrive/actions';
import { OneDriveBrowser } from '@/features/onedrive/components/onedrive-browser';
import { Button } from '@/components/ui/button';

/**
 * Task detail: attach a file from the connected OneDrive. The file is copied
 * into our own storage so preview/download/retention behave like any upload.
 */
export function TaskOneDriveAttach({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        ☁️ Aus OneDrive anhängen
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      <OneDriveBrowser
        open={open}
        onClose={() => setOpen(false)}
        mode="file"
        title="Datei aus OneDrive anhängen"
        busy={pending}
        onPickFile={(item) => {
          setError(null);
          start(async () => {
            const res = await attachOneDriveFileAction({ taskId, itemId: item.id });
            if (!res.ok) {
              setError(res.error ?? 'Anhängen fehlgeschlagen.');
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      />
    </>
  );
}
