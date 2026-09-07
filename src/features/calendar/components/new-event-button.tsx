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
  members = [],
  defaultDate,
}: {
  clients: { id: string; name: string }[];
  /** Agentur-Mitarbeiter, die dem Termin zugeordnet werden können. */
  members?: { userId: string; name: string }[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action] = useActionState(createEventAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setSelected([]);
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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
          {members.length > 0 && (
            <div className="space-y-1">
              <Label>Zugeordnete Mitarbeiter</Label>
              {selected.map((id) => (
                <input key={id} type="hidden" name="attendeeIds" value={id} />
              ))}
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {members.map((m) => (
                  <label key={m.userId} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(m.userId)}
                      onChange={() => toggle(m.userId)}
                      className="h-4 w-4"
                    />
                    {m.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Zugeordnete Mitarbeiter sehen den Termin in ihrem Tagesablauf; er
                zählt in die Tages-/Kapazitätsplanung.
              </p>
            </div>
          )}
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
