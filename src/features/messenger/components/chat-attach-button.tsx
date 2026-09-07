'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { uploadChatFile } from '@/features/messenger/upload-chat-file';

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
    const res = await uploadChatFile(channelId, file);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!res.ok) {
      onError?.(res.error ?? 'Upload fehlgeschlagen.');
      return;
    }
    onUploaded();
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
