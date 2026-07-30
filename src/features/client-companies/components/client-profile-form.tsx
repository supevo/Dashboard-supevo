'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientProfileAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

export function ClientProfileForm({
  orgId,
  clientCompanyId,
  contactEmail,
  industry,
  brands,
  interests,
  expressTicketsPerMonth,
}: {
  orgId: string;
  clientCompanyId: string;
  contactEmail: string | null;
  industry: string | null;
  brands: string | null;
  interests: string | null;
  expressTicketsPerMonth: number;
}) {
  const [state, action] = useActionState(updateClientProfileAction, idleResult);
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
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      <div className="space-y-1">
        <Label htmlFor="contactEmail">Kontakt-E-Mail</Label>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={contactEmail ?? ''}
          placeholder="kontakt@kunde.de"
        />
        <p className="text-xs text-muted-foreground">
          Empfänger für den Wochenrückblick. Bei ungültiger Domain lehnt der
          Mailserver den Versand ab.
        </p>
      </div>
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
      <div className="space-y-1">
        <Label htmlFor="expressTicketsPerMonth">
          🚀 Express-Tickets pro Monat
        </Label>
        <Input
          id="expressTicketsPerMonth"
          name="expressTicketsPerMonth"
          type="number"
          min={0}
          max={10}
          defaultValue={expressTicketsPerMonth}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          0 = automatisch nach Mitgliedschaft (Stage 1 → 1, Stage 2 → 2). Ein
          Wert &gt; 0 übersteuert das für Sonderfälle. Setzt sich am 1. jedes
          Monats zurück.
        </p>
      </div>
      <SubmitButton size="sm">{de.common.save}</SubmitButton>
    </form>
  );
}
