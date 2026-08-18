'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  generateLeadTasksAction,
  convertLeadToProjectAction,
  convertLeadToClientAction,
} from '@/features/leads/actions';

type Draft = { title: string; description: string; priority: 'low' | 'medium' | 'high' };

/**
 * Lead → Kunde + Projekt + KI-Aufgaben. Ein Klick erzeugt zuerst eine
 * KI-Vorschau der Aufgaben; nach dem Prüfen/Bearbeiten legt „Anlegen" Kunde,
 * Projekt und die bestätigten Aufgaben an.
 */
export function LeadConvertPanel({
  leadId,
  convertedClientCompanyId,
  aiEnabled,
}: {
  leadId: string;
  convertedClientCompanyId: string | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'preview'>('idle');
  const [projectName, setProjectName] = useState('');
  const [tasks, setTasks] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function startOnboarding() {
    setError(null);
    start(async () => {
      const res = await convertLeadToClientAction(leadId);
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        return;
      }
      const id = res.data?.id as string | undefined;
      if (id) router.push(`/app/clients/new?step=2&client=${id}`);
      else router.refresh();
    });
  }

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateLeadTasksAction(leadId);
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        return;
      }
      const data = res.data ?? {};
      setProjectName((data.projectName as string) ?? 'Onboarding');
      setTasks((data.tasks as Draft[]) ?? []);
      setStep('preview');
    });
  }

  function create() {
    setError(null);
    const clean = tasks
      .map((t) => ({ ...t, title: t.title.trim() }))
      .filter((t) => t.title.length > 0);
    start(async () => {
      const res = await convertLeadToProjectAction({
        leadId,
        projectName: projectName.trim() || 'Onboarding',
        tasks: clean,
      });
      if (res.status !== 'success') {
        setError('message' in res ? res.message : 'Fehlgeschlagen.');
        return;
      }
      const projectId = res.data?.projectId as string | undefined;
      if (projectId) router.push(`/app/projects/${projectId}`);
      else router.refresh();
    });
  }

  function updateTask(i: number, patch: Partial<Draft>) {
    setTasks((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeTask(i: number) {
    setTasks((ts) => ts.filter((_, idx) => idx !== i));
  }
  function addTask() {
    setTasks((ts) => [...ts, { title: '', description: '', priority: 'medium' }]);
  }

  if (convertedClientCompanyId && step === 'idle') {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="text-muted-foreground">
          Dieser Lead ist bereits ein Kunde.{' '}
          <Link
            href={`/app/clients/${convertedClientCompanyId}`}
            className="text-primary hover:underline"
          >
            Zum Kunden →
          </Link>
        </p>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Lead abschließen</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Übernimm den Lead als Kunde. Das Paket aus dem Angebot wird
            übernommen.
          </p>
        </div>

        {error && <Alert variant="destructive" className="text-xs">{error}</Alert>}

        {/* Primär: sauberer Onboarding-Eingang */}
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="text-sm font-medium">🚀 Onboarding starten</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Legt Kunde + Mitgliedschaft aus dem Paket an und öffnet den
            Onboarding-Wizard (Mitgliedschaft prüfen, Adresse & SEPA, Vertrag).
          </p>
          <Button type="button" onClick={startOnboarding} disabled={pending} className="mt-2">
            {pending ? 'Lege an …' : '🚀 Onboarding starten'}
          </Button>
        </div>

        {/* Sekundär: direkt Projekt + KI-Aufgaben */}
        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">🤖 Projekt + KI-Aufgaben</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Alternativ direkt ein Projekt anlegen: die KI schlägt anhand Module &
            Kontext passende Aufgaben vor, die du vor dem Anlegen prüfst.
          </p>
          {!aiEnabled && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Keine KI konfiguriert – du bekommst eine leere Liste zum selbst
              Befüllen.
            </p>
          )}
          <Button type="button" variant="outline" onClick={generate} disabled={pending} className="mt-2">
            {pending ? 'KI denkt nach …' : '🤖 Projekt + KI-Aufgaben'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Aufgaben prüfen &amp; anlegen</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Passe die Vorschläge an, streiche Unpassendes oder ergänze Aufgaben.
          Beim Anlegen landen sie in der Warteschlange des neuen Projekts.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground">Projektname</label>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Aufgaben – füge unten welche hinzu.
          </p>
        )}
        {tasks.map((t, i) => (
          <div key={i} className="rounded-md border p-2.5">
            <div className="flex items-start gap-2">
              <input
                value={t.title}
                onChange={(e) => updateTask(i, { title: e.target.value })}
                placeholder="Aufgabentitel"
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm font-medium"
              />
              <select
                value={t.priority}
                onChange={(e) =>
                  updateTask(i, { priority: e.target.value as Draft['priority'] })
                }
                className="rounded-md border bg-background px-1.5 py-1 text-xs"
                title="Priorität"
              >
                <option value="low">niedrig</option>
                <option value="medium">mittel</option>
                <option value="high">hoch</option>
              </select>
              <button
                type="button"
                onClick={() => removeTask(i)}
                className="px-1 text-muted-foreground hover:text-destructive"
                aria-label="Aufgabe entfernen"
              >
                ✕
              </button>
            </div>
            <textarea
              value={t.description}
              onChange={(e) => updateTask(i, { description: e.target.value })}
              rows={2}
              placeholder="Beschreibung (optional)"
              className="mt-1.5 w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addTask}
          className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          + Aufgabe hinzufügen
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={create} disabled={pending}>
          {pending ? 'Lege an …' : `Anlegen (${tasks.length} Aufgaben)`}
        </Button>
        <button
          type="button"
          onClick={() => setStep('idle')}
          disabled={pending}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="ml-auto text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
        >
          Neu vorschlagen
        </button>
      </div>
    </div>
  );
}
