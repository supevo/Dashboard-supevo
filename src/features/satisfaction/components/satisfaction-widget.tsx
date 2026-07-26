'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSatisfactionAction } from '@/features/satisfaction/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';
import type { MySatisfaction } from '@/features/satisfaction/queries';

const STARS = [1, 2, 3, 4, 5];

export function SatisfactionWidget({ initial }: { initial: MySatisfaction | null }) {
  const [rating, setRating] = useState<number>(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [state, action] = useActionState(setSatisfactionAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const shown = hover || rating;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{de.satisfaction.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{de.satisfaction.subtitle}</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          {state.status === 'success' && state.message && (
            <Alert variant="success">{state.message}</Alert>
          )}
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <input type="hidden" name="rating" value={rating} />
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
                aria-label={`${n} von 5`}
                className={cn(
                  'text-3xl leading-none transition-transform hover:scale-110',
                  n <= shown ? 'text-amber-500' : 'text-muted-foreground/30',
                )}
              >
                {n <= shown ? '★' : '☆'}
              </button>
            ))}
          </div>
          <Textarea
            name="comment"
            rows={2}
            defaultValue={initial?.comment ?? ''}
            placeholder={de.satisfaction.commentPlaceholder}
          />
          <div className="flex justify-end">
            <SubmitButton size="sm" disabled={rating === 0}>
              {initial ? de.satisfaction.update : de.satisfaction.submit}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
