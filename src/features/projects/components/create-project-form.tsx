'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createProjectAction } from '@/features/projects/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

interface Company {
  id: string;
  name: string;
}

export function CreateProjectForm({
  orgId,
  clientCompanies,
}: {
  orgId: string;
  clientCompanies: Company[];
}) {
  const [state, formAction] = useActionState(createProjectAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success' && typeof state.data?.projectId === 'string') {
      router.push(`/app/projects/${state.data.projectId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{de.projects.name}</Label>
          <Input id="name" name="name" required />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.name} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="clientCompanyId">{de.projects.client}</Label>
          <Select id="clientCompanyId" name="clientCompanyId" required defaultValue="">
            <option value="" disabled>
              — bitte wählen —
            </option>
            {clientCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.clientCompanyId} />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{de.projects.description}</Label>
        <Textarea id="description" name="description" />
      </div>
      <SubmitButton>{de.projects.create}</SubmitButton>
    </form>
  );
}
