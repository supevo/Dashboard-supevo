'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFileAction } from '@/features/files/actions';
import { isPreviewable, isImage } from '@/features/files/preview';
import { FilePreviewModal } from '@/features/files/components/file-preview-modal';
import { ImageProofing } from '@/features/proofing/components/image-proofing';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import type { FileView } from '@/features/files/queries';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileItem({
  file,
  projectId,
  taskId,
  area = 'app',
  currentUserId = '',
}: {
  file: FileView;
  projectId: string;
  taskId: string;
  /** 'portal' = client (may annotate), 'app' = agency (sees change requests). */
  area?: 'app' | 'portal';
  currentUserId?: string;
}) {
  const [state, formAction] = useActionState(deleteFileAction, idleResult);
  const [preview, setPreview] = useState(false);
  const [proofing, setProofing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const canPreview = isPreviewable(file.mimeType);
  const canProof = isImage(file.mimeType);

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        {canPreview ? (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="truncate text-left font-medium text-primary hover:underline"
          >
            {file.fileName}
          </button>
        ) : (
          <a
            href={`/api/files/${file.id}/download`}
            className="truncate font-medium text-primary hover:underline"
          >
            {file.fileName}
          </a>
        )}
        <div className="text-xs text-muted-foreground">
          {file.mimeType} · {formatSize(file.sizeBytes)}
          {file.isInternal && ` · ${de.task.internalComment}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canPreview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreview(true)}
          >
            {de.task.preview}
          </Button>
        )}
        {canProof && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setProofing(true)}
            title="Markierungen / Änderungswünsche"
          >
            🖊️ {area === 'portal' ? 'Markieren' : 'Markierungen'}
          </Button>
        )}
        <a href={`/api/files/${file.id}/download`}>
          <Button type="button" variant="ghost" size="sm">
            {de.task.download}
          </Button>
        </a>
        {file.canDelete && (
          <form action={formAction}>
            <input type="hidden" name="fileId" value={file.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="taskId" value={taskId} />
            <SubmitButton variant="ghost" size="sm">
              {de.task.delete}
            </SubmitButton>
          </form>
        )}
      </div>

      {preview && (
        <FilePreviewModal
          fileId={file.id}
          fileName={file.fileName}
          mimeType={file.mimeType}
          onClose={() => setPreview(false)}
        />
      )}

      {proofing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Markierungen"
          onClick={() => setProofing(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl rounded-lg border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="min-w-0 truncate text-lg font-semibold">🖊️ {file.fileName}</h2>
              <button
                type="button"
                onClick={() => setProofing(false)}
                aria-label={de.common.close}
                className="rounded-md px-2 text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              <ImageProofing
                fileId={file.id}
                imageUrl={`/api/files/${file.id}/download`}
                canAnnotate={area === 'portal'}
                canResolve={area !== 'portal'}
                currentUserId={currentUserId}
              />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
