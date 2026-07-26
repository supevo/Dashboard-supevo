'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';
import {
  getMyCoaching,
  getTeamEscalation,
  type CoachingResult,
} from '@/features/coaching/actions';

/**
 * On-demand KI card. mode 'me' = employee's personal coaching, mode 'team' =
 * leadership escalation. Fetches only when the user clicks (saves AI cost).
 */
export function CoachingCard({ mode }: { mode: 'me' | 'team' }) {
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'disabled' | 'done'>(
    'idle',
  );

  const run = async () => {
    setState('loading');
    const res: CoachingResult =
      mode === 'me' ? await getMyCoaching() : await getTeamEscalation();
    if (!res.enabled) {
      setState('disabled');
      return;
    }
    setText(res.text);
    setState('done');
  };

  if (state === 'disabled') return null;

  const title = mode === 'me' ? de.coaching.myTitle : de.coaching.teamTitle;
  const cta = mode === 'me' ? de.coaching.getMine : de.coaching.getTeam;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">
            {mode === 'me' ? '💬 ' : '🧭 '}
            {title}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === 'me' ? de.coaching.mySubtitle : de.coaching.teamSubtitle}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={run}
          disabled={state === 'loading'}
        >
          {state === 'loading'
            ? de.briefing.loading
            : state === 'done'
              ? de.briefing.refresh
              : cta}
        </Button>
      </CardHeader>
      {state === 'done' && (
        <CardContent>
          {text ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{de.coaching.none}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
