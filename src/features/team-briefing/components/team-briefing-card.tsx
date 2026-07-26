'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

interface Briefing {
  summary: string;
  risks: string[];
  recommendations: string[];
  model: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'error' }
  | { kind: 'ready'; briefing: Briefing | null };

/** KI weekly team overview for PM/leadership. Loads on mount, with refresh. */
export function TeamBriefingCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (method: 'GET' | 'POST') => {
    try {
      const res = await fetch('/api/team-briefing', { method });
      if (!res.ok) return setState({ kind: 'error' });
      const data = (await res.json()) as {
        enabled: boolean;
        briefing: Briefing | null;
      };
      if (!data.enabled) return setState({ kind: 'disabled' });
      setState({ kind: 'ready', briefing: data.briefing });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load('GET');
  }, [load]);

  if (state.kind === 'disabled') return null;
  const briefing = state.kind === 'ready' ? state.briefing : null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{de.teamBriefing.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {de.teamBriefing.subtitle}
          </p>
        </div>
        {state.kind === 'ready' && (
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await load('POST');
              setRefreshing(false);
            }}
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
          <p className="text-muted-foreground">{de.teamBriefing.empty}</p>
        )}
        {briefing && (
          <>
            <p>{briefing.summary}</p>
            {briefing.risks.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {de.teamBriefing.risks}
                </div>
                <div className="space-y-1.5">
                  {briefing.risks.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      <span>⚠️</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {briefing.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {de.teamBriefing.recommendations}
                </div>
                <div className="space-y-1.5">
                  {briefing.recommendations.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-primary/5 px-2.5 py-1.5"
                    >
                      <span>💡</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
