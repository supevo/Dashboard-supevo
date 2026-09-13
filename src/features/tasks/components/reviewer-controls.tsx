'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  setReviewerAction,
  submitForReviewAction,
  approveReviewAction,
  rejectReviewAction,
} from '@/features/tasks/actions';

interface Member {
  userId: string;
  name: string;
}

/** Wählt den/die Prüfer:in (Kontrolle & Beratung) – optional, eine Person. */
export function ReviewerPicker({
  taskId,
  reviewerId,
  members,
}: {
  taskId: string;
  reviewerId: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <select
      value={reviewerId ?? ''}
      disabled={busy}
      onChange={(e) =>
        start(async () => {
          const res = await setReviewerAction({
            taskId,
            reviewerId: e.target.value || null,
          });
          if (res.status === 'success') router.refresh();
        })
      }
      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
    >
      <option value="">— kein:e Prüfer:in —</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name || 'Unbenannt'}
        </option>
      ))}
    </select>
  );
}

/**
 * Steuerung des Kontroll-Flows: Verantwortliche reichen ein, Prüfer:innen geben
 * frei oder schicken mit Hinweis zurück.
 */
export function ReviewControls({
  taskId,
  isAssignee,
  isReviewer,
  canManage,
  hasReviewer,
  reviewSubmitted,
  reviewerName,
}: {
  taskId: string;
  isAssignee: boolean;
  isReviewer: boolean;
  canManage: boolean;
  hasReviewer: boolean;
  reviewSubmitted: boolean;
  reviewerName: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);

  function run(fn: () => Promise<{ status: string }>) {
    start(async () => {
      const res = await fn();
      if (res.status === 'success') {
        setRejecting(false);
        setNote('');
        router.refresh();
      }
    });
  }

  if (reviewSubmitted) {
    if (isReviewer || canManage) {
      return (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Diese Aufgabe wartet auf deine Kontrolle.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" disabled={busy} onClick={() => run(() => approveReviewAction({ taskId }))}>
              ✔ Freigeben
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejecting((v) => !v)}
            >
              ↩ Zurück an Verantwortliche:n
            </Button>
          </div>
          {rejecting && (
            <div className="space-y-1">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Was soll noch angepasst werden? (optional)"
                className="text-sm"
              />
              <Button size="sm" type="button" disabled={busy} onClick={() => run(() => rejectReviewAction({ taskId, note }))}>
                Zurückschicken
              </Button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="text-sm text-sky-600 dark:text-sky-400">
        🔍 In Kontrolle{reviewerName ? ` bei ${reviewerName}` : ''} …
      </div>
    );
  }

  if (isAssignee || canManage) {
    if (!hasReviewer) {
      return (
        <p className="text-xs text-muted-foreground">
          Wähle oben eine:n Prüfer:in, um die Aufgabe zur Kontrolle einzureichen.
        </p>
      );
    }
    return (
      <Button size="sm" type="button" disabled={busy} onClick={() => run(() => submitForReviewAction({ taskId }))}>
        Zur Kontrolle einreichen →
      </Button>
    );
  }
  return null;
}
