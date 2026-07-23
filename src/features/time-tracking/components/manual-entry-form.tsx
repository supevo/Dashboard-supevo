'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addManualEntryAction } from '@/features/time-tracking/timer-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

interface ProjectOption {
  id: string;
  name: string;
}

export function ManualEntryForm({ projects }: { projects: ProjectOption[] }) {
  const [state, formAction] = useActionState(addManualEntryAction, idleResult);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Es sind noch keine Projekte verfügbar.
      </p>
    );
  }

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="me-project">{de.time.project}</Label>
          <Select id="me-project" name="projectId" required defaultValue="">
            <option value="" disabled>
              — bitte wählen —
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isBillable" value="true" defaultChecked />
            {de.time.billable}
          </label>
          <input type="hidden" name="isBillable" value="false" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="me-start">{de.time.start}</Label>
          <Input id="me-start" name="startedAt" type="datetime-local" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="me-end">{de.time.end}</Label>
          <Input id="me-end" name="endedAt" type="datetime-local" required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="me-desc">{de.time.description}</Label>
        <Input id="me-desc" name="description" />
      </div>
      <SubmitButton size="sm">{de.time.add}</SubmitButton>
    </form>
  );
}
