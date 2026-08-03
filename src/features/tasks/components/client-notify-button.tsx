'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getClientNotifyDraft,
  notifyClientTaskDoneAction,
} from '@/features/tasks/client-notify';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Lets an employee send the client a short "task done" update. Appears on done
 * tasks (kanban badge + task detail). Only rendered on the agency side. The
 * suggested message is fetched on open and stays editable; sending awards a
 * little XP and counts toward the weekly challenge.
 */
export function ClientNotifyButton({
  taskId,
  notified: initialNotified,
  variant = 'chip',
  className,
}: {
  taskId: string;
  notified: boolean;
  variant?: 'chip' | 'card';
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notified, setNotified] = useState(initialNotified);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [noRecipients, setNoRecipients] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function openDialog(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
    setError(null);
    setNoRecipients(false);
    setLoading(true);
    const res = await getClientNotifyDraft(taskId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessage(res.message);
    setNoRecipients(!res.hasRecipients);
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await notifyClientTaskDoneAction(taskId, message);
      if (!res.ok) {
        setError(res.error ?? 'Senden fehlgeschlagen.');
        return;
      }
      setNotified(true);
      setOpen(false);
      router.refresh();
    });
  }

  const label = notified ? '✓ Kunde informiert' : '📣 Kunde informieren';

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={notified ? 'Kunde wurde informiert – erneut senden möglich' : 'Kunde über die erledigte Aufgabe informieren'}
        className={cn(
          variant === 'chip'
            ? cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                notified
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-primary/10 text-primary hover:bg-primary/20',
              )
            : cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted',
                notified && 'text-emerald-600',
              ),
          className,
        )}
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Kunde informieren">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : noRecipients ? (
          <p className="text-sm text-muted-foreground">
            Dieser Kunde hat noch keinen Ansprechpartner mit Portal-Zugang – lade
            zuerst einen Kontakt ein.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Diese Nachricht erhält der Kunde im Portal (und per E-Mail, falls
              aktiviert). Du kannst sie vor dem Senden anpassen.
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className="text-sm"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || message.trim().length < 5}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? 'Sende…' : 'An Kunden senden'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
