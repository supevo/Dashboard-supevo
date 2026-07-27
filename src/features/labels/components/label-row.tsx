'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteLabelAction,
  updateLabelAction,
} from '@/features/labels/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';
import { LabelChip } from '@/components/ui/label-chip';
import type { Label as LabelType } from '@/features/labels/queries';

export function LabelRow({
  orgId,
  label,
}: {
  orgId: string;
  label: LabelType;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(
    updateLabelAction,
    idleResult,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteLabelAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (updateState.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [updateState, router]);
  useEffect(() => {
    if (deleteState.status === 'success') router.refresh();
  }, [deleteState, router]);

  if (editing) {
    return (
      <form action={updateAction} className="flex flex-wrap items-center gap-2 py-2">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="labelId" value={label.id} />
        <Input name="name" defaultValue={label.name} className="h-8 w-40" required />
        <Input
          name="color"
          type="color"
          defaultValue={label.color}
          className="h-8 w-14 p-1"
        />
        <Input
          name="description"
          defaultValue={label.description ?? ''}
          placeholder={de.labels.description}
          className="h-8 w-48"
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked={label.isActive}
          />
          {de.labels.active}
        </label>
        <input type="hidden" name="isActive" value="false" />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            name="isClientVisible"
            value="true"
            defaultChecked={label.isClientVisible}
          />
          {de.labels.clientVisible}
        </label>
        <input type="hidden" name="isClientVisible" value="false" />
        <select
          name="intensity"
          defaultValue={String(label.intensity)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="1">{de.labels.intensityNormal}</option>
          <option value="2">{de.labels.intensityStrong}</option>
        </select>
        <SubmitButton size="sm">{de.labels.save}</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <LabelChip name={label.name} color={label.color} intensity={label.intensity} />
        {!label.isActive && (
          <span className="text-xs text-muted-foreground">
            ({de.labels.inactive})
          </span>
        )}
        {label.isClientVisible && (
          <span className="text-xs text-muted-foreground">
            · {de.labels.clientVisible}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-primary hover:underline"
        >
          {de.task.edit}
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="labelId" value={label.id} />
          <SubmitButton variant="ghost" size="sm">
            {de.labels.delete}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
