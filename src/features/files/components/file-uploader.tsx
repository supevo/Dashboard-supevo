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
import { cn } from '@/lib/utils';

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
  const [dragActive, setDragActive] = useState(false);
  const [isInternal, setIsInternal] = useState(allowInternal);

  async function uploadMany(files: File[]) {
    for (const file of files) {
      // Stop the batch on the first failure (upload sets the error).
      // eslint-disable-next-line no-await-in-loop
      const ok = await upload(file);
      if (!ok) break;
    }
  }

  async function upload(file: File): Promise<boolean> {
    setError(null);

    // Fail fast in the browser before any network round-trip.
    const clientError = validateUpload({ size: file.size, type: file.type });
    if (clientError) {
      setError(CLIENT_ERROR_MESSAGES[clientError] ?? de.task.uploadError);
      return false;
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
        return false;
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
        return false;
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
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError(de.task.uploadError);
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
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

      <label
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) void uploadMany(files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition',
          dragActive
            ? 'border-primary bg-primary/10'
            : 'border-input hover:border-primary/50 hover:bg-muted/50',
          pending && 'pointer-events-none opacity-60',
        )}
      >
        <span className="text-2xl" aria-hidden>
          {pending ? '⏳' : '📎'}
        </span>
        <span className="text-sm font-medium">
          {pending ? de.common.loading : 'Dateien hierher ziehen oder klicken'}
        </span>
        <span className="text-xs text-muted-foreground">
          Mehrere möglich · max. {Math.round(DEFAULT_MAX_SIZE_BYTES / (1024 * 1024))} MB je Datei
        </span>
        <input
          type="file"
          multiple
          disabled={pending}
          accept={DEFAULT_ALLOWED_MIME.join(',')}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void uploadMany(files);
            e.target.value = '';
          }}
          className="hidden"
        />
      </label>
    </div>
  );
}
