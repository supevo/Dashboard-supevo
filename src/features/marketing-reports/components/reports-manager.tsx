'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertMarketingReportAction,
  deleteMarketingReportAction,
} from '@/features/marketing-reports/actions';
import type { MarketingReport } from '@/features/marketing-reports/queries';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

function screenshotsToText(report: MarketingReport | null): string {
  if (!report) return '';
  return report.screenshots
    .map((s) => (s.caption ? `${s.url} | ${s.caption}` : s.url))
    .join('\n');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ReportForm({
  clientCompanyId,
  editing,
  onDone,
}: {
  clientCompanyId: string;
  editing: MarketingReport | null;
  onDone: () => void;
}) {
  const [state, action] = useActionState(upsertMarketingReportAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="periodLabel">{de.marketingReport.periodLabel}</Label>
          <Input
            id="periodLabel"
            name="periodLabel"
            required
            defaultValue={editing?.periodLabel ?? ''}
            placeholder="KW 30 · 21.–27. Juli 2026"
          />
        </div>
        <div>
          <Label htmlFor="periodStart">{de.marketingReport.periodStart}</Label>
          <Input
            id="periodStart"
            name="periodStart"
            type="date"
            required
            defaultValue={editing?.periodStart ?? todayIso()}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="summary">{de.marketingReport.summary}</Label>
        <Textarea id="summary" name="summary" rows={2} defaultValue={editing?.summary ?? ''} />
      </div>
      <div>
        <Label htmlFor="ranking">{de.marketingReport.ranking}</Label>
        <Textarea id="ranking" name="ranking" rows={3} defaultValue={editing?.ranking ?? ''} />
      </div>
      <div>
        <Label htmlFor="sea">{de.marketingReport.sea}</Label>
        <Textarea id="sea" name="sea" rows={3} defaultValue={editing?.sea ?? ''} />
      </div>
      <div>
        <Label htmlFor="inquiries">{de.marketingReport.inquiries}</Label>
        <Textarea id="inquiries" name="inquiries" rows={3} defaultValue={editing?.inquiries ?? ''} />
      </div>
      <div>
        <Label htmlFor="screenshots">{de.marketingReport.screenshotsLabel}</Label>
        <Textarea
          id="screenshots"
          name="screenshots"
          rows={3}
          defaultValue={screenshotsToText(editing)}
          placeholder="https://…/ranking.png | Ranking Hauptkeyword"
        />
        <p className="mt-1 text-xs text-muted-foreground">{de.marketingReport.screenshotsHint}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={editing ? editing.published : true}
          className="h-4 w-4 rounded border-input"
        />
        {de.marketingReport.publishedLabel}
      </label>

      <div className="flex gap-2">
        <SubmitButton size="sm">
          {editing ? de.common.save : de.marketingReport.create}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function DeleteButton({
  id,
  clientCompanyId,
}: {
  id: string;
  clientCompanyId: string;
}) {
  const [state, action] = useActionState(deleteMarketingReportAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <SubmitButton variant="ghost" size="sm">
        {de.common.delete}
      </SubmitButton>
    </form>
  );
}

/** Agency-side manager: create/edit/delete a client's marketing reports. */
export function ReportsManager({
  clientCompanyId,
  reports,
}: {
  clientCompanyId: string;
  reports: MarketingReport[];
}) {
  const [mode, setMode] = useState<'idle' | 'new' | string>('idle');

  return (
    <div className="space-y-4">
      {mode === 'idle' && (
        <Button size="sm" onClick={() => setMode('new')}>
          {de.marketingReport.newReport}
        </Button>
      )}
      {mode === 'new' && (
        <ReportForm
          clientCompanyId={clientCompanyId}
          editing={null}
          onDone={() => setMode('idle')}
        />
      )}

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.marketingReport.empty}</p>
      ) : (
        <ul className="divide-y">
          {reports.map((r) => (
            <li key={r.id} className="py-3">
              {mode === r.id ? (
                <ReportForm
                  clientCompanyId={clientCompanyId}
                  editing={r}
                  onDone={() => setMode('idle')}
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.periodLabel}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.published ? de.marketingReport.visible : de.marketingReport.draft}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setMode(r.id)}>
                      {de.common.edit}
                    </Button>
                    <DeleteButton id={r.id} clientCompanyId={clientCompanyId} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
