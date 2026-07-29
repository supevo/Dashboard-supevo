'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertMarketingReportAction,
  deleteMarketingReportAction,
  generateReportDraftAction,
} from '@/features/marketing-reports/actions';
import type { MarketingReport } from '@/features/marketing-reports/queries';
import { WEEKLY_REPORT_PROMPT } from '@/features/marketing-reports/report-prompt';
import {
  currentIsoWeek,
  isoWeekOfDateString,
  weekToPeriod,
} from '@/features/marketing-reports/week';
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
  const [summary, setSummary] = useState(editing?.summary ?? '');
  const [week, setWeek] = useState(
    editing ? isoWeekOfDateString(editing.periodStart) : currentIsoWeek(),
  );
  const [genPending, startGen] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  function generateFromTasks() {
    setNotice(null);
    startGen(async () => {
      const res = await generateReportDraftAction(clientCompanyId);
      if (!res.ok) {
        setNotice(res.error ?? 'Konnte keinen Entwurf erstellen.');
        return;
      }
      if (res.hasActivity === false) {
        setNotice(
          'Für die letzten 7 Tage gibt es keine kundensichtbaren Aufgaben – es wurde kein Entwurf erzeugt.',
        );
        return;
      }
      if (res.summary) setSummary(res.summary);
    });
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(WEEKLY_REPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice('Kopieren nicht möglich – bitte manuell markieren.');
    }
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      {notice && <Alert variant="default">{notice}</Alert>}
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="flex flex-wrap gap-2 rounded-md border border-dashed bg-background/60 p-3">
        <Button type="button" size="sm" variant="outline" disabled={genPending} onClick={generateFromTasks}>
          {genPending ? 'Wird erzeugt …' : '📊 Wochenbericht aus Aufgaben erzeugen'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={copyPrompt}>
          {copied ? 'Prompt kopiert ✓' : '📋 Prompt kopieren'}
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          &bdquo;Aus Aufgaben erzeugen&ldquo; schreibt eine Zusammenfassung der erledigten &amp;
          laufenden Arbeit in das Zusammenfassungs-Feld. Ranking/SEO, SEA und Anfragen tragen Sie
          manuell ein – leere Abschnitte erscheinen dem Kunden nicht. Der Prompt hilft beim
          strukturierten Erfassen der Zahlen.
        </p>
      </div>

      <div className="sm:max-w-xs">
        <Label htmlFor="week">Kalenderwoche</Label>
        <Input
          id="week"
          name="week"
          type="week"
          required
          value={week}
          onChange={(e) => setWeek(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {weekToPeriod(week)?.periodLabel ?? 'Bitte eine Woche wählen.'}
        </p>
      </div>

      <div>
        <Label htmlFor="summary">{de.marketingReport.summary}</Label>
        <Textarea
          id="summary"
          name="summary"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
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
