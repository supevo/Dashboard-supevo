'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function FileUploader({
  projectId,
  taskId,
  allowInternal = true,
}: {
  projectId: string;
  taskId: string;
  allowInternal?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [isInternal, setIsInternal] = useState(allowInternal);

  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('projectId', projectId);
      fd.set('taskId', taskId);
      fd.set('isInternal', String(isInternal));
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? de.task.uploadError);
      } else {
        router.refresh();
      }
    } catch {
      setError(de.task.uploadError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
      className="space-y-2 rounded-md border border-dashed p-4"
    >
      {error && <Alert variant="destructive">{error}</Alert>}
      {allowInternal && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
          />
          {de.task.uploadInternal}
        </label>
      )}
      <input
        type="file"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        className="block text-sm"
      />
      <Button type="button" variant="outline" size="sm" disabled={pending}>
        {pending ? de.common.loading : de.task.upload}
      </Button>
      <p className="text-xs text-muted-foreground">
        Auch per Drag &amp; Drop. Max. 25 MB.
      </p>
    </div>
  );
}
