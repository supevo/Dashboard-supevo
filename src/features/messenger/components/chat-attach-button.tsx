'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 📎 attachment button + hidden file input encapsulating the direct-to-storage
 * upload flow (create signed target → upload in the browser → finalize). Shared
 * by the full messenger page and the floating chat dock so both offer file
 * sharing. Errors are surfaced to the parent via `onError` so it can place the
 * message where it fits the layout.
 */
export function ChatAttachButton({
  channelId,
  onUploaded,
  onError,
  className,
}: {
  channelId: string;
  onUploaded: () => void;
  onError?: (message: string | null) => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File) {
    onError?.(null);
    setUploading(true);
    try {
      const createRes = await fetch('/api/chat-files/create-upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const created = (await createRes.json()) as {
        path?: string;
        token?: string;
        storagePath?: string;
        error?: string;
      };
      if (!createRes.ok || !created.path || !created.token || !created.storagePath) {
        onError?.(created.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from('files')
        .uploadToSignedUrl(created.path, created.token, file, {
          contentType: file.type,
        });
      if (upErr) {
        onError?.('Upload fehlgeschlagen.');
        return;
      }
      const finRes = await fetch('/api/chat-files/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          storagePath: created.storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const fin = (await finRes.json()) as { ok?: boolean; error?: string };
      if (!finRes.ok || !fin.ok) {
        onError?.(fin.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      onUploaded();
    } catch {
      onError?.('Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="Datei anhängen"
        title="Datei anhängen (max. 25 MB)"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50',
          className,
        )}
      >
        {uploading ? '⏳' : '📎'}
      </button>
    </>
  );
}
