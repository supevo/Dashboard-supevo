'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInviteAction } from '@/features/auth/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction] = useActionState(acceptInviteAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      router.replace('/');
    }
  }, [state.status, router]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <p className="text-sm text-muted-foreground">{de.auth.inviteHint}</p>
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="email">{de.auth.email}</Label>
        <Input id="email" type="email" value={email} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">{de.auth.fullName}</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.fullName} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{de.auth.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.password} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{de.auth.newPasswordConfirm}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.confirmPassword} />
        )}
      </div>
      <SubmitButton className="w-full">{de.auth.acceptInvite}</SubmitButton>
    </form>
  );
}
