'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  validateUpload,
  DEFAULT_ALLOWED_MIME,
  DEFAULT_MAX_SIZE_BYTES,
} from '@/lib/files/validation';
import { de } from '@/lib/i18n/de';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  EMPTY: 'Die Datei ist leer.',
  TOO_LARGE: 'Die Datei überschreitet die maximale Größe (25 MB).',
  MIME_NOT_ALLOWED: 'Dieser Dateityp ist nicht erlaubt.',
};

/** Computes a SHA-256 hex digest of the file in the browser (integrity check). */
async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null; // Non-secure context: checksum is optional.
  }
}

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

    // Fail fast in the browser before any network round-trip.
    const clientError = validateUpload({ size: file.size, type: file.type });
    if (clientError) {
      setError(CLIENT_ERROR_MESSAGES[clientError] ?? de.task.uploadError);
      return;
    }

    setPending(true);
    try {
      // Step 1: ask the server for a one-time signed upload target.
      const createRes = await fetch('/api/files/create-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const createJson = (await createRes.json()) as {
        path?: string;
        token?: string;
        storagePath?: string;
        error?: string;
      };
      if (!createRes.ok || !createJson.path || !createJson.token) {
        setError(createJson.error ?? de.task.uploadError);
        return;
      }

      // Step 2: upload the bytes DIRECTLY to Supabase Storage (no Vercel limit).
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from('files')
        .uploadToSignedUrl(createJson.path, createJson.token, file, {
          contentType: file.type,
        });
      if (uploadError) {
        setError(de.task.uploadError);
        return;
      }

      // Step 3: record the metadata row.
      const checksum = await sha256Hex(file);
      const finalizeRes = await fetch('/api/files/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskId,
          storagePath: createJson.storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          isInternal,
        }),
      });
      const finalizeJson = (await finalizeRes.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!finalizeRes.ok || !finalizeJson.ok) {
        setError(finalizeJson.error ?? de.task.uploadError);
        return;
      }

      router.refresh();
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
        accept={DEFAULT_ALLOWED_MIME.join(',')}
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
        Auch per Drag &amp; Drop. Max.{' '}
        {Math.round(DEFAULT_MAX_SIZE_BYTES / (1024 * 1024))} MB.
      </p>
    </div>
  );
}
