'use client';

import { useState, useTransition } from 'react';
import { createPollAction } from '@/features/messenger/actions';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAX_OPTIONS = 10;

/**
 * 📊 button that opens a small dialog to start a poll: a question, 2–10 options
 * and an optional "multiple choice" toggle. On success it reloads the stream so
 * the poll appears inline. Shared by the messenger page and the chat dock.
 */
export function PollComposer({
  channelId,
  onCreated,
  className,
}: {
  channelId: string;
  onCreated: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
  }

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']));
  }
  function removeOption(i: number) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function submit() {
    setError(null);
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length === 0 || clean.length < 2) {
      setError('Bitte Frage und mindestens zwei Optionen angeben.');
      return;
    }
    startTransition(async () => {
      const res = await createPollAction({
        channelId,
        question: question.trim(),
        options: clean,
        allowMultiple: multiple,
      });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setOpen(false);
      reset();
      onCreated();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abstimmung starten"
        title="Abstimmung starten"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md border hover:bg-muted',
          className,
        )}
      >
        📊
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Abstimmung starten">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Frage
            </label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Worüber stimmen wir ab?"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              Optionen
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label="Option entfernen"
                    className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Option hinzufügen
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
              className="h-4 w-4"
            />
            Mehrfachauswahl erlauben
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? 'Wird gestartet…' : 'Starten'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
