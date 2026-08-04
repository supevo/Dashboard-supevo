'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  submitIdeaAction,
  promoteIdeaToQueueAction,
} from '@/features/ideas/actions';
import type { ClientIdea, IdeaProject } from '@/features/ideas/queries';
import { idleResult } from '@/lib/action-result';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';

/** One idea row: open ideas can be pushed to the work queue in one click. */
function IdeaRow({ idea }: { idea: ClientIdea }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function promote() {
    setError(null);
    start(async () => {
      const res = await promoteIdeaToQueueAction(idea.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">💡 {idea.title}</div>
          {idea.description && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {idea.description}
            </div>
          )}
        </div>
        {idea.status === 'queued' ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            ✓ In der Warteschlange
          </span>
        ) : (
          <button
            type="button"
            onClick={promote}
            disabled={pending}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            title="Diese Idee als Aufgabe in die Warteschlange schieben"
          >
            {pending ? '…' : '→ In die Warteschlange'}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function IdeasBoard({
  ideas,
  projects,
}: {
  ideas: ClientIdea[];
  projects: IdeaProject[];
}) {
  const [state, formAction] = useActionState(submitIdeaAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>💡 Neue Idee</CardTitle>
          <p className="text-sm text-muted-foreground">
            Haltet eure Ideen fest. Mit einem Klick landet eine Idee als Aufgabe
            in der Warteschlange – wir kümmern uns darum.
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3">
            {state.status === 'error' && (
              <Alert variant="destructive">{state.message}</Alert>
            )}
            {state.status === 'success' && <Alert>{state.message}</Alert>}
            <div className="space-y-1">
              <Label htmlFor="title">Titel</Label>
              <Input id="title" name="title" required maxLength={200} placeholder="Worum geht's?" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Beschreibung (optional)</Label>
              <Textarea id="description" name="description" rows={2} maxLength={4000} />
            </div>
            {projects.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="projectId">Projekt (für &bdquo;In die Warteschlange&ldquo;)</Label>
                <Select id="projectId" name="projectId" defaultValue={projects[0]?.id ?? ''}>
                  <option value="">– kein Projekt –</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <SubmitButton size="sm">Idee hinzufügen</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eure Ideen</CardTitle>
        </CardHeader>
        <CardContent>
          {ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Ideen – legt oben die erste an.
            </p>
          ) : (
            <ul className="divide-y">
              {ideas.map((idea) => (
                <IdeaRow key={idea.id} idea={idea} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
