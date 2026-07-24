'use client';

import { useEffect, useState } from 'react';
import { de } from '@/lib/i18n/de';
import { Button } from '@/components/ui/button';

/**
 * Lightweight preview overlay. Fetches a short-lived inline signed URL and
 * renders images, PDFs and videos in place. Anything else offers a download.
 */
export function FilePreviewModal({
  fileId,
  fileName,
  mimeType,
  onClose,
}: {
  fileId: string;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/files/${fileId}/url?disposition=inline`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: { url: string }) => {
        if (active) setUrl(json.url);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [fileId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isVideo = mimeType.startsWith('video/');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-white">
        <span className="truncate text-sm font-medium">{fileName}</span>
        <div className="flex shrink-0 gap-2">
          <a href={`/api/files/${fileId}/download`}>
            <Button type="button" variant="outline" size="sm">
              {de.task.download}
            </Button>
          </a>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {de.common.close}
          </Button>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-background"
      >
        {error ? (
          <p className="p-6 text-sm text-muted-foreground">
            {de.task.previewError}
          </p>
        ) : !url ? (
          <p className="p-6 text-sm text-muted-foreground">
            {de.common.loading}
          </p>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={fileName}
            className="max-h-full max-w-full object-contain"
          />
        ) : isPdf ? (
          <iframe src={url} title={fileName} className="h-full w-full" />
        ) : isVideo ? (
          <video src={url} controls className="max-h-full max-w-full" />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            {de.task.previewUnavailable}
          </p>
        )}
      </div>
    </div>
  );
}
