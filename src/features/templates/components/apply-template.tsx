'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { applyTemplateAction } from '@/features/templates/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { ProjectTemplate } from '@/features/templates/queries';

export function ApplyTemplate({
  projectId,
  templates,
}: {
  projectId: string;
  templates: ProjectTemplate[];
}) {
  const [state, action] = useActionState(applyTemplateAction, idleResult);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {de.templates.none}{' '}
        <Link href="/app/templates" className="text-primary hover:underline">
          {de.templates.manage}
        </Link>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm text-muted-foreground">{de.templates.applyHint}</p>
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-9 w-auto"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.tasks.length})
            </option>
          ))}
        </Select>
        <SubmitButton size="sm" variant="outline">
          {de.templates.apply}
        </SubmitButton>
      </div>
    </form>
  );
}
