'use client';

import { useActionState, useEffect } from 'react';
import {
  archiveProjectAction,
  updateProjectAction,
} from '@/features/projects/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import type { ProjectDetail } from '@/features/projects/queries';

const STATUSES = [
  'planned',
  'active',
  'on_hold',
  'completed',
  'archived',
] as const;

export function ProjectSettingsForm({
  orgId,
  project,
  onSaved,
}: {
  orgId: string;
  project: ProjectDetail;
  /** Called after a successful save or archive (e.g. to refresh/close). */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(updateProjectAction, idleResult);
  const [archiveState, archiveAction] = useActionState(
    archiveProjectAction,
    idleResult,
  );

  useEffect(() => {
    if (state.status === 'success' || archiveState.status === 'success') {
      onSaved?.();
    }
  }, [state.status, archiveState.status, onSaved]);

  return (
    <div className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="projectId" value={project.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{de.projects.name}</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={project.status}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {de.projectStatus[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{de.projects.description}</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={project.description ?? ''}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isClientVisible"
            value="true"
            defaultChecked={project.isClientVisible}
          />
          {de.projects.clientVisible}
        </label>
        {/* Ensure a value is always submitted for the visibility flag. */}
        <input type="hidden" name="isClientVisible" value="false" />
        <SubmitButton>{de.common.save}</SubmitButton>
      </form>

      <form action={archiveAction}>
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="projectId" value={project.id} />
        <SubmitButton variant="destructive" size="sm">
          Projekt archivieren
        </SubmitButton>
        {archiveState.status === 'error' && (
          <p className="mt-1 text-xs text-destructive">
            {archiveState.message}
          </p>
        )}
      </form>
    </div>
  );
}
