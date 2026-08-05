'use client';

import { DropZone } from '@/components/ui/drop-zone';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { uploadFileToTask } from '@/lib/files/upload-client';
import {
  validateUpload,
  DEFAULT_ALLOWED_MIME,
  DEFAULT_MAX_SIZE_BYTES,
} from '@/lib/files/validation';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

/**
 * Portal button that lets a client add a task with a title, briefing and
 * optional file attachments. Due date and internal visibility are agency-only
 * and intentionally omitted. The task and files are created client-visible.
 */
export function AddClientTask({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function reset() {
    formRef.current?.reset();
    setFiles([]);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    for (const f of files) {
      if (validateUpload({ size: f.size, type: f.type })) {
        setError(`${de.task.uploadError} (${f.name})`);
        return;
      }
    }

    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const result = await createClientTaskAction(idleResult, fd);
      if (result.status !== 'success') {
        setError(result.status === 'error' ? result.message : de.errors.INTERNAL);
        return;
      }
      const taskId =
        typeof result.data?.taskId === 'string' ? result.data.taskId : null;

      // Attach files to the freshly created task (best-effort, sequential).
      if (taskId && files.length > 0) {
        for (const file of files) {
          const up = await uploadFileToTask({
            projectId,
            taskId,
            file,
            isInternal: false,
          });
          if (!up.ok) {
            setError(`${de.task.uploadError} (${file.name})`);
            // Task was created; stop uploading further files.
            break;
          }
        }
      }

      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError(de.errors.INTERNAL);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
      >
        + {de.portal.addTask}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.portal.addTask}>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="space-y-1">
            <Label htmlFor="title">{de.kanban.taskTitle}</Label>
            <Input id="title" name="title" required autoFocus />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Briefing</Label>
            <Textarea id="description" name="description" rows={4} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="files">{de.task.files}</Label>
            <DropZone overlayLabel="Dateien hier ablegen">
              <input
                id="files"
                type="file"
                multiple
                accept={DEFAULT_ALLOWED_MIME.join(',')}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block text-sm"
              />
            </DropZone>
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.length} Datei(en) ausgewählt
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Max. {Math.round(DEFAULT_MAX_SIZE_BYTES / (1024 * 1024))} MB je
              Datei.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <Button type="submit" disabled={pending}>
              {pending ? de.common.loading : de.portal.addTask}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
