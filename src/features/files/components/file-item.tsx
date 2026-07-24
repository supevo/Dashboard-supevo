'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFileAction } from '@/features/files/actions';
import { isPreviewable } from '@/features/files/preview';
import { FilePreviewModal } from '@/features/files/components/file-preview-modal';
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
}: {
  file: FileView;
  projectId: string;
  taskId: string;
}) {
  const [state, formAction] = useActionState(deleteFileAction, idleResult);
  const [preview, setPreview] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const canPreview = isPreviewable(file.mimeType);

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
    </li>
  );
}
