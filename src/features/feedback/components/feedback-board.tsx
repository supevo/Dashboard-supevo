'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateFeedbackAction,
  deleteFeedbackAction,
} from '@/features/feedback/actions';
import type {
  FeedbackItem,
  FeedbackStatus,
} from '@/features/feedback/queries';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STATUSES: { key: FeedbackStatus; label: string }[] = [
  { key: 'new', label: '📥 Neu' },
  { key: 'planned', label: '📌 Geplant' },
  { key: 'in_progress', label: '🔧 In Arbeit' },
  { key: 'done', label: '✅ Erledigt' },
  { key: 'rejected', label: '🗑️ Abgelehnt' },
];

const KIND_LABEL: Record<string, string> = {
  bug: '🐞 Fehler',
  idea: '💡 Idee',
  wish: '⭐ Wunsch',
};

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(item.adminNotes ?? '');
  const [savedNote, setSavedNote] = useState(item.adminNotes ?? '');

  const changeStatus = (status: FeedbackStatus) =>
    start(async () => {
      await updateFeedbackAction({ id: item.id, status });
      router.refresh();
    });

  const saveNotes = () =>
    start(async () => {
      await updateFeedbackAction({ id: item.id, adminNotes: notes });
      setSavedNote(notes);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      await deleteFeedbackAction(item.id);
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {KIND_LABEL[item.kind] ?? item.kind}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString('de-DE')}
        </span>
      </div>

      <div className="text-sm font-semibold">{item.title}</div>
      {item.message && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {item.message}
        </p>
      )}
      <div className="text-[11px] text-muted-foreground">
        von {item.authorName ?? '—'}{' '}
        <span className="rounded bg-muted px-1">
          {item.authorRole === 'client' ? 'Kunde' : 'Team'}
        </span>
      </div>

      <div className="space-y-1">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Interne Notiz / Prompt …"
          className="text-xs"
        />
        {notes !== savedNote && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" disabled={pending} onClick={saveNotes}>
              Notiz speichern
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t pt-2">
        <select
          value={item.status}
          disabled={pending}
          onChange={(e) => changeStatus(e.target.value as FeedbackStatus)}
          className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Löschen"
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Admin board: feedback grouped into status columns (kanban-artig). */
export function FeedbackBoard({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch kein Feedback eingegangen.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STATUSES.map((col) => {
        const colItems = items.filter((i) => i.status === col.key);
        return (
          <div key={col.key} className="w-72 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{col.label}</span>
              <span
                className={cn(
                  'rounded-full px-2 text-xs text-muted-foreground',
                  colItems.length > 0 && 'bg-muted',
                )}
              >
                {colItems.length}
              </span>
            </div>
            <div className="space-y-2">
              {colItems.map((item) => (
                <FeedbackCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
