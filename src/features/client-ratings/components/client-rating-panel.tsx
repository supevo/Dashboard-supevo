'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rateTaskExecutionAction } from '@/features/client-ratings/actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/**
 * Client-facing star rating for a finished task: "Wie bewerten Sie die
 * Ausführung dieser Aufgabe?" 1–5 stars + optional comment. Shows and lets the
 * client update an existing rating.
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
      setError('Bitte wählen Sie 1 bis 5 Sterne.');
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
        Wie bewerten Sie die Ausführung dieser Aufgabe?
      </p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Sterne">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} Stern${n > 1 ? 'e' : ''}`}
            aria-checked={stars === n}
            role="radio"
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => {
              setStars(n);
              setSaved(false);
            }}
            className={cn(
              'text-3xl leading-none transition',
              n <= shown ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300',
            )}
          >
            ★
          </button>
        ))}
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
