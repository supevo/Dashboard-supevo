'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyClientProfileAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function MyClientProfileForm({
  industry,
  brands,
  interests,
}: {
  industry: string | null;
  brands: string | null;
  interests: string | null;
}) {
  const [state, action] = useActionState(updateMyClientProfileAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}

      <div className="space-y-1">
        <Label htmlFor="industry">{de.clientProfile.industry}</Label>
        <Input id="industry" name="industry" defaultValue={industry ?? ''} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="brands">{de.clientProfile.brands}</Label>
        <Textarea
          id="brands"
          name="brands"
          rows={2}
          defaultValue={brands ?? ''}
          placeholder={de.clientProfile.brandsHint}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="interests">{de.clientProfile.interests}</Label>
        <Textarea
          id="interests"
          name="interests"
          rows={2}
          defaultValue={interests ?? ''}
          placeholder={de.clientProfile.interestsHint}
        />
      </div>
      <SubmitButton size="sm">{de.common.save}</SubmitButton>
    </form>
  );
}
