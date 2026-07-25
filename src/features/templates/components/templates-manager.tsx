'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTemplateAction,
  deleteTemplateAction,
} from '@/features/templates/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { ProjectTemplate, TemplateTask } from '@/features/templates/queries';
import type { TaskPriority } from '@/lib/database.types';

interface Row {
  title: string;
  priority: TaskPriority;
  is_internal: boolean;
}

function TemplateCard({ template }: { template: ProjectTemplate }) {
  const [, remove] = useActionState(deleteTemplateAction, idleResult);
  const router = useRouter();
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{template.name}</div>
        <form action={remove} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
          <input type="hidden" name="id" value={template.id} />
          <SubmitButton variant="ghost" size="sm">
            {de.templates.delete}
          </SubmitButton>
        </form>
      </div>
      <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
        {template.tasks.map((t, i) => (
          <li key={i}>
            {t.title}{' '}
            <span className="text-xs">
              ({de.priority[t.priority]},{' '}
              {t.is_internal ? de.task.internal : de.task.clientVisible})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TemplatesManager({
  templates,
}: {
  templates: ProjectTemplate[];
}) {
  const [state, formAction] = useActionState(createTemplateAction, idleResult);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { title: '', priority: 'medium', is_internal: true },
  ]);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      setName('');
      setRows([{ title: '', priority: 'medium', is_internal: true }]);
      router.refresh();
    }
  }, [state, router]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const tasksJson: TemplateTask[] = rows
    .filter((r) => r.title.trim())
    .map((r) => ({
      title: r.title.trim(),
      description: '',
      priority: r.priority,
      is_internal: r.is_internal,
    }));

  return (
    <div className="space-y-6">
      {templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      <form action={formAction} className="space-y-3 rounded-md border p-4">
        <div className="font-medium">{de.templates.newTemplate}</div>
        {state.status === 'error' && (
          <Alert variant="destructive">{state.message}</Alert>
        )}
        <input type="hidden" name="tasks" value={JSON.stringify(tasksJson)} />
        <div className="space-y-1">
          <Label htmlFor="tpl-name">{de.templates.name}</Label>
          <Input
            id="tpl-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-9"
          />
        </div>

        <div className="space-y-2">
          <Label>{de.templates.tasks}</Label>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                value={r.title}
                onChange={(e) => setRow(i, { title: e.target.value })}
                placeholder={de.templates.taskTitle}
                className="h-9 flex-1"
              />
              <Select
                value={r.priority}
                onChange={(e) =>
                  setRow(i, { priority: e.target.value as TaskPriority })
                }
                className="h-9 w-auto"
              >
                <option value="low">{de.priority.low}</option>
                <option value="medium">{de.priority.medium}</option>
                <option value="high">{de.priority.high}</option>
                <option value="urgent">{de.priority.urgent}</option>
              </Select>
              <Select
                value={r.is_internal ? 'true' : 'false'}
                onChange={(e) =>
                  setRow(i, { is_internal: e.target.value === 'true' })
                }
                className="h-9 w-auto"
              >
                <option value="true">{de.task.internal}</option>
                <option value="false">{de.task.clientVisible}</option>
              </Select>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="px-2 text-muted-foreground hover:text-foreground"
                  aria-label={de.templates.removeRow}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                { title: '', priority: 'medium', is_internal: true },
              ])
            }
            className="text-sm text-primary hover:underline"
          >
            + {de.templates.addRow}
          </button>
        </div>

        <SubmitButton size="sm">{de.templates.save}</SubmitButton>
      </form>
    </div>
  );
}
