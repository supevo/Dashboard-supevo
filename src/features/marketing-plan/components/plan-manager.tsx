'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPlanAction,
  applyTemplateAction,
  aiDraftPlanAction,
  addPhaseAction,
  updatePhaseAction,
  deletePhaseAction,
  movePhaseAction,
  updatePlanClosingAction,
  addPlanItemAction,
  updatePlanItemAction,
  deletePlanItemAction,
  releasePlanAction,
  embedNextPhaseAction,
  embedPlanPhaseAction,
} from '@/features/marketing-plan/actions';
import type {
  MarketingPlan,
  PlanItem,
  PlanPhase,
} from '@/features/marketing-plan/queries';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { ActionResult } from '@/lib/action-result';

const PLAN_STATUS: Record<string, string> = {
  draft: '📝 Entwurf',
  in_review: '🔄 Beim Kunden zur Abstimmung',
  accepted: '✅ Akzeptiert',
};

/** Shared run helper: runs an action, surfaces errors, refreshes the page. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      after?.();
      router.refresh();
    });
  return { pending, error, run };
}

/** A single measure: click the text to edit it inline (title). */
function MeasureRow({ item }: { item: PlanItem }) {
  const { pending, error, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  const save = () =>
    run(
      () => updatePlanItemAction({ itemId: item.id, title, description: '' }),
      () => setEditing(false),
    );

  if (item.status === 'embedded') {
    return (
      <li className="flex items-start justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5 text-sm">
        <span className="min-w-0">
          {item.title}
          <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
            Im Kanban
          </span>
        </span>
      </li>
    );
  }

  if (editing) {
    return (
      <li className="rounded border bg-muted/30 px-2 py-1.5">
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim().length >= 2) save();
              if (e.key === 'Escape') {
                setTitle(item.title);
                setEditing(false);
              }
            }}
          />
          <Button size="sm" disabled={pending || title.trim().length < 2} onClick={save}>
            OK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setTitle(item.title);
              setEditing(false);
            }}
          >
            Abbrechen
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5 text-sm">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Zum Bearbeiten klicken"
        className="min-w-0 flex-1 text-left hover:text-primary"
      >
        {item.title}
      </button>
      <button
        type="button"
        disabled={pending}
        aria-label="Maßnahme löschen"
        onClick={() => run(() => deletePlanItemAction(item.id))}
        className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
      >
        ✕
      </button>
    </li>
  );
}

function MeasureAdd({ phaseId }: { phaseId: string }) {
  const { pending, error, run } = useRun();
  const [title, setTitle] = useState('');
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Neue Maßnahme …"
          maxLength={200}
          className="h-9"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || title.trim().length < 2}
          onClick={() =>
            run(
              () => addPlanItemAction({ phaseId, title, description: '' }),
              () => setTitle(''),
            )
          }
        >
          + Maßnahme
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PhaseCard({
  phase,
  index,
  count,
}: {
  phase: PlanPhase;
  index: number;
  count: number;
}) {
  const { pending, error, run } = useRun();
  const [title, setTitle] = useState(phase.title);
  const [hint, setHint] = useState(phase.timeframeHint ?? '');
  const [outcome, setOutcome] = useState(phase.outcome ?? '');

  const dirty =
    title !== phase.title ||
    hint !== (phase.timeframeHint ?? '') ||
    outcome !== (phase.outcome ?? '');

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Phasen-Titel (z. B. „Phase 1 – Fundament und Strategie“)"
            maxLength={200}
            className="font-semibold"
          />
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Zeit-Hinweis (optional, z. B. „zu Beginn der Zusammenarbeit“)"
            maxLength={200}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            disabled={pending || index === 0}
            onClick={() => run(() => movePhaseAction({ phaseId: phase.id, direction: 'up' }))}
            className="rounded px-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Nach oben"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={pending || index === count - 1}
            onClick={() => run(() => movePhaseAction({ phaseId: phase.id, direction: 'down' }))}
            className="rounded px-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label="Nach unten"
          >
            ▼
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {phase.items.map((it) => (
          <MeasureRow key={it.id} item={it} />
        ))}
        {phase.items.length === 0 && (
          <li className="text-xs text-muted-foreground">Noch keine Maßnahmen.</li>
        )}
      </ul>

      <MeasureAdd phaseId={phase.id} />

      <div className="mt-3">
        <Textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          rows={2}
          placeholder="Ergebnis dieser Phase (die dunkle Box im Plan)"
          maxLength={2000}
          className="text-sm"
        />
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => deletePhaseAction(phase.id))}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Phase löschen
        </button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !phase.items.some((i) => i.status !== 'embedded')}
            onClick={() => run(() => embedPlanPhaseAction(phase.id))}
            title="Nur diese Phase ins Kanban übernehmen (Label „Marketingplan“)"
          >
            Diese Phase ins Kanban
          </Button>
          <Button
            size="sm"
            disabled={pending || !dirty || title.trim().length < 2}
            onClick={() =>
              run(() =>
                updatePhaseAction({
                  phaseId: phase.id,
                  title,
                  timeframeHint: hint,
                  outcome,
                }),
              )
            }
          >
            Phase speichern
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClosingNote({ plan }: { plan: MarketingPlan }) {
  const { pending, error, run } = useRun();
  const [note, setNote] = useState(plan.closingNote ?? '');
  const dirty = note !== (plan.closingNote ?? '');
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Schlusssatz (optional)
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="z. B. „Diese Schritte bauen logisch aufeinander auf …“"
        maxLength={2000}
        className="mt-2 text-sm"
      />
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() =>
            run(() => updatePlanClosingAction({ planId: plan.id, closingNote: note }))
          }
        >
          Speichern
        </Button>
      </div>
    </div>
  );
}

function AddPhase({ planId }: { planId: string }) {
  const { pending, error, run } = useRun();
  const [title, setTitle] = useState('');
  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Neue Phase (Titel)"
          maxLength={200}
        />
        <Button
          size="sm"
          disabled={pending || title.trim().length < 2}
          onClick={() => run(() => addPhaseAction({ planId, title }), () => setTitle(''))}
        >
          + Phase
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Buttons to seed an empty plan from the template or an AI draft. */
function SeedButtons({ clientCompanyId }: { clientCompanyId: string }) {
  const { pending, error, run } = useRun();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => applyTemplateAction({ clientCompanyId }))}
        >
          Vorlage einfügen
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => aiDraftPlanAction({ clientCompanyId }))}
        >
          🤖 KI-Entwurf
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PlanManager({
  clientCompanyId,
  plan,
}: {
  clientCompanyId: string;
  plan: MarketingPlan | null;
}) {
  const { pending, error, run } = useRun();
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function importPdf(file: File) {
    setImportError(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(
        `/api/clients/${clientCompanyId}/marketing-plan/import`,
        { method: 'POST', body: fd },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setImportError(json.error ?? 'Import fehlgeschlagen.');
        return;
      }
      router.refresh();
    } catch {
      setImportError('Import fehlgeschlagen.');
    } finally {
      setImporting(false);
    }
  }

  if (!plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Noch kein Marketingplan. Starte mit der Standard-Vorlage, lass die KI
          einen Entwurf erstellen oder baue ihn leer von Hand auf – ganz ohne
          festen Zeitraum, nur in Phasen.
        </p>
        {(error || importError) && (
          <Alert variant="destructive">{error || importError}</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || importing}
            onClick={() => run(() => applyTemplateAction({ clientCompanyId }))}
          >
            Aus Vorlage anlegen
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || importing}
            onClick={() => run(() => aiDraftPlanAction({ clientCompanyId }))}
          >
            🤖 KI-Entwurf erstellen
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPdf(f);
              if (importRef.current) importRef.current.value = '';
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || importing}
            onClick={() => importRef.current?.click()}
            title="Bestehenden Marketingplan als PDF hochladen – die KI liest Phasen & Maßnahmen aus."
          >
            {importing ? '⏳ Liest PDF…' : '📄 Aus PDF importieren'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || importing}
            onClick={() => run(() => createPlanAction({ clientCompanyId }))}
          >
            Leeren Plan anlegen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {PLAN_STATUS[plan.status] ?? plan.status}
        </span>
        <div className="flex gap-2">
          {plan.items.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => releasePlanAction(plan.id))}
              title={
                plan.status === 'accepted'
                  ? 'Plan erneut zur Zustimmung an den Kunden senden (Inhalt bleibt; bereits akzeptierte Maßnahmen müssen erneut bestätigt werden).'
                  : 'Plan zur Abstimmung an den Kunden senden.'
              }
            >
              {plan.status === 'draft'
                ? 'Zur Abstimmung freigeben'
                : plan.status === 'accepted'
                  ? 'Erneut zur Abstimmung'
                  : 'Erneut an Kunden senden'}
            </Button>
          )}
          <Button
            size="sm"
            disabled={pending || !plan.items.some((i) => i.status !== 'embedded')}
            onClick={() => run(() => embedNextPhaseAction(plan.id))}
            title="Die nächste offene Phase als Kanban-Aufgaben übernehmen (mit Label „Marketingplan“)"
          >
            Nächste Phase ins Kanban
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {plan.phases.length === 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-sm text-muted-foreground">
            Der Plan ist noch leer. Schnellstart:
          </p>
          <SeedButtons clientCompanyId={clientCompanyId} />
        </div>
      )}

      {plan.phases.map((phase, i) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          index={i}
          count={plan.phases.length}
        />
      ))}

      <AddPhase planId={plan.id} />
      <ClosingNote plan={plan} />
    </div>
  );
}
