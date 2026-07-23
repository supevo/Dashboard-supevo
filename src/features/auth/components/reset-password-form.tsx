'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/features/auth/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, idleResult);

  if (state.status === 'success') {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          Dein Passwort wurde gespeichert. Du kannst dich jetzt anmelden.
        </Alert>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {de.common.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">{de.auth.newPassword}</Label>
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
      <SubmitButton className="w-full">
        {de.auth.resetPasswordSubmit}
      </SubmitButton>
    </form>
  );
}
