'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { requestAbsenceAction } from '@/features/absences/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function RequestAbsenceForm() {
  const [state, action] = useActionState(requestAbsenceAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="type">{de.absence.type}</Label>
          <Select id="type" name="type" defaultValue="urlaub" className="h-9">
            <option value="urlaub">{de.absence.types.urlaub}</option>
            <option value="krank">{de.absence.types.krank}</option>
            <option value="sonstiges">{de.absence.types.sonstiges}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="startDate">{de.absence.from}</Label>
          <Input id="startDate" name="startDate" type="date" required className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endDate">{de.absence.to}</Label>
          <Input id="endDate" name="endDate" type="date" required className="h-9" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="note">{de.absence.note}</Label>
        <Textarea id="note" name="note" rows={2} />
      </div>
      <SubmitButton size="sm">{de.absence.submit}</SubmitButton>
    </form>
  );
}
