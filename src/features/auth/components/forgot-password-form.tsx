'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/features/auth/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    idleResult,
  );

  if (state.status === 'success') {
    return (
      <div className="space-y-4">
        <Alert variant="success">{state.message}</Alert>
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
      <p className="text-sm text-muted-foreground">
        {de.auth.forgotPasswordHint}
      </p>
      <div className="space-y-2">
        <Label htmlFor="email">{de.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.email} />
        )}
      </div>
      <SubmitButton className="w-full">
        {de.auth.forgotPasswordSubmit}
      </SubmitButton>
      <div className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {de.common.backToLogin}
        </Link>
      </div>
    </form>
  );
}
