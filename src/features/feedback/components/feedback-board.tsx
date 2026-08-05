'use client';

import { useEffect, useState, useTransition } from 'react';
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

function FeedbackCard({
  item,
  onMove,
  onRemove,
}: {
  item: FeedbackItem;
  onMove: (id: string, status: FeedbackStatus) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(item.adminNotes ?? '');
  const [savedNote, setSavedNote] = useState(item.adminNotes ?? '');

  const saveNotes = () =>
    start(async () => {
      await updateFeedbackAction({ id: item.id, adminNotes: notes });
      setSavedNote(notes);
      router.refresh();
    });

  const remove = () => {
    onRemove(item.id); // optimistic: disappears immediately
    start(async () => {
      await deleteFeedbackAction(item.id);
      router.refresh();
    });
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group cursor-grab space-y-2 rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          <span className="mr-1 opacity-40 group-hover:opacity-70" aria-hidden>⠿</span>
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
          onChange={(e) => onMove(item.id, e.target.value as FeedbackStatus)}
          className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
          aria-label="Status ändern"
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

/**
 * Admin board: feedback grouped into status columns with drag & drop. A card can
 * be dragged onto another column to change its status (optimistic, then saved);
 * the per-card dropdown stays as a keyboard/touch fallback. Feedback has no
 * intra-column order, so native HTML5 DnD is enough — no positions to persist.
 */
export function FeedbackBoard({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [list, setList] = useState<FeedbackItem[]>(items);
  const [dragOver, setDragOver] = useState<FeedbackStatus | null>(null);
  const [, start] = useTransition();

  // Keep local state in sync when the server sends fresh data.
  useEffect(() => setList(items), [items]);

  function move(id: string, status: FeedbackStatus) {
    setList((prev) => {
      const cur = prev.find((i) => i.id === id);
      if (!cur || cur.status === status) return prev;
      return prev.map((i) => (i.id === id ? { ...i, status } : i));
    });
    start(async () => {
      await updateFeedbackAction({ id, status });
      router.refresh();
    });
  }

  function removeLocal(id: string) {
    setList((prev) => prev.filter((i) => i.id !== id));
  }

  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch kein Feedback eingegangen.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STATUSES.map((col) => {
        const colItems = list.filter((i) => i.status === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOver !== col.key) setDragOver(col.key);
            }}
            onDragLeave={(e) => {
              // Only clear when actually leaving the column, not its children.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOver((d) => (d === col.key ? null : d));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              setDragOver(null);
              if (id) move(id, col.key);
            }}
            className={cn(
              'w-72 shrink-0 rounded-lg p-1 transition-colors',
              dragOver === col.key && 'bg-primary/5 ring-2 ring-primary/40',
            )}
          >
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
            <div className="min-h-[40px] space-y-2">
              {colItems.map((item) => (
                <FeedbackCard
                  key={item.id}
                  item={item}
                  onMove={move}
                  onRemove={removeLocal}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
