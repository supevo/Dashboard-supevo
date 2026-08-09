'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rateTaskExecutionAction } from '@/features/client-ratings/actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/**
 * Client-facing result rating for a finished task: "Wie bewerten Sie das
 * Ergebnis dieser Aufgabe?" 1–10 + optional comment. Shows and lets the client
 * update an existing rating. The 1–10 result feeds an XP bonus to the person who
 * finished the task.
 */
export function ClientRatingPanel({
  taskId,
  projectId,
  initial,
}: {
  taskId: string;
  projectId: string;
  initial: { stars: number; comment: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    if (stars < 1) {
      setError('Bitte wählen Sie 1 bis 10.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await rateTaskExecutionAction({ taskId, projectId, stars, comment });
      if (res.status === 'error') {
        setError(res.message);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const shown = hover || stars;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Wie bewerten Sie das Ergebnis dieser Aufgabe? (1–10)
      </p>
      <div
        className="flex flex-wrap items-center gap-1"
        role="radiogroup"
        aria-label="Bewertung 1 bis 10"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} von 10`}
            aria-checked={stars === n}
            role="radio"
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              setStars(n);
              setSaved(false);
            }}
            className={cn(
              'text-2xl leading-none transition',
              n <= shown ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300',
            )}
          >
            {n <= shown ? '★' : '☆'}
          </button>
        ))}
        <span className="ml-2 text-sm font-medium tabular-nums text-muted-foreground">
          {shown > 0 ? `${shown}/10` : ''}
        </span>
      </div>

      <Textarea
        rows={2}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setSaved(false);
        }}
        maxLength={2000}
        placeholder="Optionaler Kommentar zur Ausführung …"
      />

      {error && <Alert variant="destructive">{error}</Alert>}
      {saved && (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Bewertung gespeichert – vielen Dank!
        </p>
      )}

      <Button size="sm" disabled={pending || stars < 1} onClick={submit}>
        {pending ? 'Wird gespeichert …' : initial ? 'Bewertung aktualisieren' : 'Bewertung absenden'}
      </Button>
    </div>
  );
}
