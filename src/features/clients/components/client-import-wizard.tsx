'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  analyzeClientImportAction,
  createImportedClientAction,
} from '@/features/clients/ai-import-actions';
import type { ExtractedClient } from '@/features/clients/ai-import';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { de } from '@/lib/i18n/de';
import type { BillingEntity } from '@/features/billing/queries';

const t = de.clientImport;

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ''} />
    </div>
  );
}

/** One editable review card for an extracted client, with its own save state. */
function ReviewCard({
  orgId,
  client,
  entities,
}: {
  orgId: string;
  client: ExtractedClient;
  entities: BillingEntity[];
}) {
  const [state, formAction] = useActionState(
    createImportedClientAction,
    idleResult,
  );
  const [withMembership, setWithMembership] = useState(
    client.stage != null || client.payment_method != null,
  );
  const savedId =
    state.status === 'success' &&
    typeof state.data?.clientCompanyId === 'string'
      ? state.data.clientCompanyId
      : null;

  const defaultEntity = entities.find((e) => e.is_default);

  // Extras without a dedicated column are preserved in the notes field.
  const notes = [
    client.contact_name ? `Ansprechpartner: ${client.contact_name}` : null,
    client.phone ? `Telefon: ${client.phone}` : null,
    client.website ? `Website: ${client.website}` : null,
    client.membership_note ? `Abo: ${client.membership_note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (savedId) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium">
          {client.name} – {t.saved}
        </p>
        <Link
          href={`/app/clients/${savedId}`}
          className="text-sm text-primary hover:underline"
        >
          {t.openClient} →
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <input type="hidden" name="orgId" value={orgId} />

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}

      {client.questions.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t.questions}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {client.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label={t.fieldName} defaultValue={client.name} />
        <Field name="contact_email" label={t.fieldEmail} type="email" defaultValue={client.contact_email} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">{de.clients.notes}</Label>
        <Textarea id="notes" name="notes" defaultValue={notes} rows={3} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="billing_entity_id">{t.fieldEntity}</Label>
        <select
          id="billing_entity_id"
          name="billing_entity_id"
          defaultValue={defaultEntity?.id ?? ''}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Standard</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.is_default ? ' – Standard' : ''}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="create_membership"
          checked={withMembership}
          onChange={(e) => setWithMembership(e.target.checked)}
        />
        {t.createMembership}
      </label>

      {withMembership && (
        <div className="space-y-4 rounded-md bg-muted/40 p-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="stage">{t.fieldStage}</Label>
              <select
                id="stage"
                name="stage"
                defaultValue={String(client.stage ?? 1)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="interval_months">{t.fieldInterval}</Label>
              <select
                id="interval_months"
                name="interval_months"
                defaultValue={String(client.interval_months ?? 1)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="12">12</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment_method">{t.fieldPayment}</Label>
              <select
                id="payment_method"
                name="payment_method"
                defaultValue={client.payment_method ?? 'transfer'}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="transfer">{t.paymentTransfer}</option>
                <option value="sepa">{t.paymentSepa}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="billing_name" label={t.fieldName} defaultValue={client.name} />
            <Field name="billing_address_line1" label={t.fieldAddress1} defaultValue={client.address_line1} />
            <Field name="billing_address_line2" label={t.fieldAddress2} defaultValue={client.address_line2} />
            <Field name="billing_postal_code" label={t.fieldPostal} defaultValue={client.postal_code} />
            <Field name="billing_city" label={t.fieldCity} defaultValue={client.city} />
            <Field name="billing_country" label={t.fieldCountry} defaultValue={client.country ?? 'Deutschland'} />
            <Field name="iban" label={t.fieldIban} defaultValue={client.iban} />
            <Field name="mandate_reference" label={t.fieldMandateRef} defaultValue={client.mandate_reference} />
            <Field name="mandate_date" label={t.fieldMandateDate} type="date" defaultValue={client.mandate_date} />
          </div>
        </div>
      )}

      <SubmitButton>{t.save}</SubmitButton>
    </form>
  );
}

/** Paste/URL → AI analysis → editable review cards. */
export function ClientImportWizard({
  orgId,
  entities,
  aiEnabled,
}: {
  orgId: string;
  entities: BillingEntity[];
  aiEnabled: boolean;
}) {
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [state, formAction] = useActionState(
    analyzeClientImportAction,
    idleResult,
  );
  const [clients, setClients] = useState<ExtractedClient[]>([]);

  useEffect(() => {
    if (state.status === 'success' && Array.isArray(state.data?.clients)) {
      setClients(state.data.clients as ExtractedClient[]);
    }
  }, [state]);

  if (!aiEnabled) {
    return <Alert variant="destructive">{t.disabled}</Alert>;
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="mode" value={mode} />

        <div className="inline-flex rounded-md border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded px-3 py-1 ${mode === 'text' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {t.modeText}
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`rounded px-3 py-1 ${mode === 'url' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {t.modeUrl}
          </button>
        </div>

        {mode === 'text' ? (
          <div className="space-y-1">
            <Label htmlFor="text">{t.textLabel}</Label>
            <Textarea id="text" name="text" rows={8} placeholder={t.textPlaceholder} />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="url">{t.urlLabel}</Label>
            <Input id="url" name="url" type="url" placeholder={t.urlPlaceholder} />
          </div>
        )}

        {state.status === 'error' && (
          <Alert variant="destructive">{state.message}</Alert>
        )}

        <SubmitButton>{t.analyze}</SubmitButton>
      </form>

      {clients.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t.reviewTitle}</h2>
          {clients.map((client, i) => (
            <ReviewCard key={i} orgId={orgId} client={client} entities={entities} />
          ))}
        </div>
      )}
    </div>
  );
}
