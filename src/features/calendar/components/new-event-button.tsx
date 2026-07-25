'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEventAction } from '@/features/calendar/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function NewEventButton({
  clients,
  defaultDate,
}: {
  clients: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createEventAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + {de.calendar.newEvent}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.calendar.newEvent}>
        <form ref={formRef} action={action} className="space-y-3">
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="ev-title">{de.calendar.eventTitle}</Label>
            <Input id="ev-title" name="title" required autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ev-date">{de.calendar.date}</Label>
              <Input
                id="ev-date"
                name="eventDate"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-start">{de.calendar.start}</Label>
              <Input id="ev-start" name="startTime" type="time" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-end">{de.calendar.end}</Label>
              <Input id="ev-end" name="endTime" type="time" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-client">{de.calendar.client}</Label>
            <Select id="ev-client" name="clientCompanyId" defaultValue="">
              <option value="">{de.calendar.noClient}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-loc">{de.calendar.location}</Label>
            <Input id="ev-loc" name="location" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-note">{de.calendar.note}</Label>
            <Textarea id="ev-note" name="note" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.calendar.save}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
