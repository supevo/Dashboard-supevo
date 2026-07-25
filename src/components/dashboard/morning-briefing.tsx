'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

interface Priority {
  title: string;
  reason: string;
}

interface Briefing {
  summary: string;
  priorities: Priority[];
  nextMove: string | null;
  notes: string[];
  model: string | null;
  createdAt: string;
}

interface ApiResponse {
  enabled: boolean;
  briefing: Briefing | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'error' }
  | { kind: 'ready'; briefing: Briefing | null };

/**
 * "Guten Morgen" card: fetches the employee's AI briefing on mount (generated
 * and cached server-side once per day) and offers a refresh. Renders nothing
 * blocking — the rest of the dashboard is independent.
 */
export function MorningBriefing({ firstName }: { firstName: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (method: 'GET' | 'POST') => {
    try {
      const res = await fetch('/api/briefing/today', { method });
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as ApiResponse;
      if (!data.enabled) {
        setState({ kind: 'disabled' });
        return;
      }
      setState({ kind: 'ready', briefing: data.briefing });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load('GET');
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load('POST');
    setRefreshing(false);
  };

  // Hide the card entirely when AI is not configured, to avoid noise.
  if (state.kind === 'disabled') return null;

  const briefing = state.kind === 'ready' ? state.briefing : null;

  // Time-aware greeting (Morgen/Tag/Abend) based on the viewer's local time.
  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? 'Guten Morgen'
      : hour < 18
        ? 'Guten Tag'
        : 'Guten Abend';

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>
            {greeting}
            {firstName ? `, ${firstName}` : ''} 👋
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {de.briefing.subtitle}
          </p>
        </div>
        {state.kind === 'ready' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? de.briefing.loading : de.briefing.refresh}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {state.kind === 'loading' && (
          <p className="text-muted-foreground">{de.briefing.loading}</p>
        )}
        {state.kind === 'error' && (
          <p className="text-muted-foreground">{de.briefing.error}</p>
        )}
        {state.kind === 'ready' && !briefing && (
          <p className="text-muted-foreground">{de.briefing.empty}</p>
        )}
        {briefing && (
          <>
            <p>{briefing.summary}</p>

            {briefing.priorities.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de.briefing.priorities}
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  {briefing.priorities.map((p, i) => (
                    <li key={i}>
                      <span className="font-medium">{p.title}</span>
                      {p.reason ? (
                        <span className="text-muted-foreground">
                          {' '}
                          — {p.reason}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {briefing.nextMove && (
              <div className="rounded-md border border-primary/30 bg-background p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {de.briefing.nextMove}
                </div>
                <p className="mt-1">{briefing.nextMove}</p>
              </div>
            )}

            {briefing.notes.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de.briefing.notes}
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {briefing.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
