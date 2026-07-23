'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createLabelAction } from '@/features/labels/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function CreateLabelForm({ orgId }: { orgId: string }) {
  const [state, formAction] = useActionState(createLabelAction, idleResult);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="name">{de.labels.name}</Label>
          <Input id="name" name="name" required />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.name} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">{de.labels.color}</Label>
          <Input id="color" name="color" type="color" defaultValue="#3366ff" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isClientVisible" value="true" />
            {de.labels.clientVisible}
          </label>
          <input type="hidden" name="isClientVisible" value="false" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{de.labels.description}</Label>
        <Input id="description" name="description" />
      </div>
      <SubmitButton>{de.labels.create}</SubmitButton>
    </form>
  );
}
