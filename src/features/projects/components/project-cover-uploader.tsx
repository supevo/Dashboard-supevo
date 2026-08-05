'use client';

import { DropZone } from '@/components/ui/drop-zone';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { de } from '@/lib/i18n/de';

/** Compact cover-image control shown on the project page for managers. */
export function ProjectCoverUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/projects/${projectId}/cover`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? de.task.uploadError);
      } else {
        setFailed(false);
        setVersion((v) => v + 1);
        router.refresh();
      }
    } catch {
      setError(de.task.uploadError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted',
        )}
      >
        {failed ? (
          <span className="text-xs text-muted-foreground">
            {de.projects.noCover}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/projects/${projectId}/cover?v=${version}`}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <DropZone className="space-y-1" overlayLabel="Titelbild ablegen">
        <label className="block cursor-pointer text-sm text-primary hover:underline">
          {pending ? de.common.loading : de.projects.setCover}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={pending}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        {error && <Alert variant="destructive">{error}</Alert>}
      </DropZone>
    </div>
  );
}
