'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientTaskBriefingAction } from '@/features/tasks/actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * Portal: lets the client add or change the briefing (task description) of a
 * task they can see. Rendered as escaped plain text in view mode.
 */
export function ClientBriefingEditor({
  projectId,
  taskId,
  description,
}: {
  projectId: string;
  taskId: string;
  description: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [value, setValue] = useState(description ?? '');
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateClientTaskBriefingAction({ projectId, taskId, description: value });
      if (res.status === 'error') {
        setError(res.message);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        {description ? (
          <div className="whitespace-pre-wrap text-sm">{description}</div>
        ) : (
          <p className="text-sm text-muted-foreground">Noch kein Briefing hinterlegt.</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          {description ? 'Briefing bearbeiten' : 'Briefing hinzufügen'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="destructive">{error}</Alert>}
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Briefing: Ziel, Kontext, Anforderungen, Links …"
        className="min-h-40"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          {pending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setValue(description ?? '');
            setEditing(false);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
