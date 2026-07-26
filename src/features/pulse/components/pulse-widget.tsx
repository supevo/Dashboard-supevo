'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPulseAction } from '@/features/pulse/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

const MOODS = [
  { value: 1, emoji: '☹️', label: 'Schwierig' },
  { value: 2, emoji: '😐', label: 'Geht so' },
  { value: 3, emoji: '😀', label: 'Gut' },
];

export function PulseWidget({
  initial,
}: {
  initial: { mood: number; comment: string | null } | null;
}) {
  const [mood, setMood] = useState<number>(initial?.mood ?? 0);
  const [state, action] = useActionState(setPulseAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{de.pulse.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{de.pulse.subtitle}</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          {state.status === 'success' && state.message && (
            <Alert variant="success">{state.message}</Alert>
          )}
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <input type="hidden" name="mood" value={mood} />
          <div className="flex gap-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(m.value)}
                title={m.label}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 transition-colors',
                  mood === m.value
                    ? 'border-primary bg-primary/10'
                    : 'hover:bg-muted',
                )}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-xs">{m.label}</span>
              </button>
            ))}
          </div>
          <Textarea
            name="comment"
            rows={2}
            defaultValue={initial?.comment ?? ''}
            placeholder={de.pulse.commentPlaceholder}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {de.pulse.anonymous}
            </span>
            <SubmitButton size="sm" disabled={mood === 0}>
              {initial ? de.pulse.update : de.pulse.submit}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
