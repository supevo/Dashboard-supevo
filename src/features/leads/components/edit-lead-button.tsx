'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadAction } from '@/features/leads/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { Lead } from '@/features/leads/types';

/** Pencil button on a lead card → modal to edit the lead's core fields. */
export function EditLeadButton({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateLeadAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const euro =
    lead.estimatedValueCents != null
      ? (lead.estimatedValueCents / 100).toFixed(2).replace('.', ',')
      : '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Lead bearbeiten"
        className="text-muted-foreground hover:text-foreground"
      >
        ✎
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Lead bearbeiten">
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={lead.id} />
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="e-name">{de.leads.contactName}</Label>
              <Input id="e-name" name="contactName" required defaultValue={lead.contactName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-company">{de.leads.company}</Label>
              <Input id="e-company" name="company" defaultValue={lead.company ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-email">{de.leads.email}</Label>
              <Input id="e-email" name="email" type="email" defaultValue={lead.email ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-phone">{de.leads.phone}</Label>
              <Input id="e-phone" name="phone" defaultValue={lead.phone ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-source">{de.leads.source}</Label>
              <Input id="e-source" name="source" defaultValue={lead.source ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-value">{de.leads.value}</Label>
              <Input id="e-value" name="value" defaultValue={euro} placeholder="z. B. 2500" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-industry">Branche</Label>
              <Input
                id="e-industry"
                name="industry"
                defaultValue={lead.industry ?? ''}
                placeholder="z. B. Zahnarztpraxis"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-website">Website / Ist-Zustand</Label>
              <Input
                id="e-website"
                name="website"
                defaultValue={lead.website ?? ''}
                placeholder="z. B. muster-praxis.de"
              />
            </div>
          </div>
          <div className="rounded-md border border-dashed p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Anschrift (für den Vertrag – nach deutschem Recht Pflicht)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="e-addr1">Straße &amp; Hausnr.</Label>
                <Input
                  id="e-addr1"
                  name="addressLine1"
                  defaultValue={lead.addressLine1 ?? ''}
                  placeholder="z. B. Musterstraße 12"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="e-addr2">Adresszusatz (optional)</Label>
                <Input
                  id="e-addr2"
                  name="addressLine2"
                  defaultValue={lead.addressLine2 ?? ''}
                  placeholder="z. B. c/o, Gebäude, Etage"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-plz">PLZ</Label>
                <Input id="e-plz" name="postalCode" defaultValue={lead.postalCode ?? ''} placeholder="12345" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-city">Ort</Label>
                <Input id="e-city" name="city" defaultValue={lead.city ?? ''} placeholder="Musterstadt" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-country">Land</Label>
                <Input id="e-country" name="country" defaultValue={lead.country ?? ''} placeholder="DE" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-goals">Ziele / Vorhaben</Label>
            <Textarea id="e-goals" name="goals" rows={2} defaultValue={lead.goals ?? ''} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-target">Zielgruppe</Label>
            <Textarea
              id="e-target"
              name="targetGroup"
              rows={2}
              defaultValue={lead.targetGroup ?? ''}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-note">{de.leads.note}</Label>
            <Textarea id="e-note" name="note" rows={2} defaultValue={lead.note ?? ''} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.leads.save}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
