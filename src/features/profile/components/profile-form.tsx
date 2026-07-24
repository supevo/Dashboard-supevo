'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction } from '@/features/profile/actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/ui/submit-button';

/** Edit form for the current user's own profile details. */
export function ProfileForm({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <div className="space-y-1">
        <Label htmlFor="fullName">Name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          Die E-Mail-Adresse kann derzeit nicht geändert werden.
        </p>
      </div>

      <SubmitButton size="sm">Speichern</SubmitButton>
    </form>
  );
}
