'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '@/features/auth/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(signInAction, idleResult);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />
      <div className="space-y-2">
        <Label htmlFor="email">{de.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.email} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{de.auth.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.password} />
        )}
      </div>
      <SubmitButton className="w-full">{de.auth.login}</SubmitButton>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          {de.auth.forgotPassword}
        </Link>
      </div>
    </form>
  );
}
