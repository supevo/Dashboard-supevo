'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFileAction } from '@/features/files/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
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
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between py-2">
      <div className="min-w-0">
        <a
          href={`/api/files/${file.id}/download`}
          className="truncate font-medium text-primary hover:underline"
        >
          {file.fileName}
        </a>
        <div className="text-xs text-muted-foreground">
          {file.mimeType} · {formatSize(file.sizeBytes)}
          {file.isInternal && ` · ${de.task.internalComment}`}
        </div>
      </div>
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
    </li>
  );
}
