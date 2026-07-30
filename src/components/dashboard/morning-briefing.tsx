'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TaskStatusControl,
  type TaskStatus,
} from '@/features/tasks/components/task-status-control';
import { de } from '@/lib/i18n/de';

interface Priority {
  title: string;
  reason: string;
  taskId?: string | null;
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
  statuses?: Record<string, TaskStatus>;
}

type State =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'error' }
  | { kind: 'ready'; briefing: Briefing | null; statuses: Record<string, TaskStatus> };

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
      setState({
        kind: 'ready',
        briefing: data.briefing,
        statuses: data.statuses ?? {},
      });
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
  const statuses = state.kind === 'ready' ? state.statuses : {};

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
            <p className="leading-relaxed">{briefing.summary}</p>

            {briefing.nextMove && (
              <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-background p-3">
                <span className="text-xl leading-none">⚡</span>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {de.briefing.nextMove}
                  </div>
                  <p className="mt-0.5">{briefing.nextMove}</p>
                </div>
              </div>
            )}

            {briefing.priorities.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  🎯 {de.briefing.priorities}
                </div>
                <div className="space-y-2">
                  {briefing.priorities.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-background p-2.5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {p.taskId ? (
                              <Link
                                href={`/app/tasks/${p.taskId}`}
                                className="hover:underline"
                              >
                                {p.title}
                                <span className="ml-1 text-xs text-primary">↗</span>
                              </Link>
                            ) : (
                              p.title
                            )}
                          </div>
                          {p.reason && (
                            <div className="text-xs text-muted-foreground">
                              {p.reason}
                            </div>
                          )}
                          {p.taskId && (
                            <div className="mt-2">
                              <TaskStatusControl
                                taskId={p.taskId}
                                status={statuses[p.taskId] ?? null}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefing.notes.length > 0 && (
              <div className="space-y-1.5">
                {briefing.notes.map((n, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <span>⚠️</span>
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
