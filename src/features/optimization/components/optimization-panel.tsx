'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyWorkloadOptimizationAction,
  updateOptimizationSettingsAction,
} from '@/features/optimization/actions';
import type { OptimizationSettings, OptimizationCadence } from '@/features/optimization/queries';
import { Select } from '@/components/ui/select';
import { formatBerlinDateTime } from '@/lib/time';

const CADENCE_LABEL: Record<OptimizationCadence, string> = {
  off: 'Aus',
  daily: 'Täglich',
  every_2_days: 'Alle 2 Tage',
  weekly: 'Wöchentlich',
};

/**
 * KI-Arbeitsoptimierung: „Jetzt optimieren" (manuell anwenden) plus
 * Automatikmodus + Intervall, das die Optimierung per Cron unbeaufsichtigt
 * ausführt. Admin-only (Auslastungsseite).
 */
export function OptimizationPanel({ initial }: { initial: OptimizationSettings }) {
  const router = useRouter();
  const [cadence, setCadence] = useState<OptimizationCadence>(initial.cadence);
  const [autoApply, setAutoApply] = useState(initial.autoApply);
  const [reassign, setReassign] = useState(initial.reassign);
  const [changes, setChanges] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, startApply] = useTransition();
  const [saving, startSave] = useTransition();

  function save(next: { cadence?: OptimizationCadence; autoApply?: boolean; reassign?: boolean }) {
    const payload = {
      cadence: next.cadence ?? cadence,
      autoApply: next.autoApply ?? autoApply,
      reassign: next.reassign ?? reassign,
    };
    setError(null);
    startSave(async () => {
      const res = await updateOptimizationSettingsAction(payload);
      if (res.status === 'error') setError(res.message);
    });
  }

  function apply() {
    setError(null);
    setNotice(null);
    setChanges(null);
    startApply(async () => {
      const res = await applyWorkloadOptimizationAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(res.message);
      setChanges(res.changes);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={applying}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {applying ? 'Optimiere…' : '🔧 Jetzt optimieren'}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reassign}
            onChange={(e) => {
              setReassign(e.target.checked);
              save({ reassign: e.target.checked });
            }}
            className="h-4 w-4"
          />
          Auch umverteilen/entlasten (nicht nur unbesetzte)
        </label>
        {initial.lastRunAt && (
          <span className="text-xs text-muted-foreground">
            Zuletzt: {formatBerlinDateTime(initial.lastRunAt)}
          </span>
        )}
      </div>

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="mb-2 text-sm font-semibold">🤖 Automatikmodus (z. B. im Urlaub)</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Läuft dann vollautomatisch per Zeitplan – ohne Seitenaufruf oder Bestätigung.
          Du bekommst danach eine Zusammenfassung als Benachrichtigung.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => {
                setAutoApply(e.target.checked);
                save({ autoApply: e.target.checked });
              }}
              className="h-4 w-4"
            />
            Automatikmodus aktiv
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Intervall</span>
            <Select
              value={cadence}
              onChange={(e) => {
                const v = e.target.value as OptimizationCadence;
                setCadence(v);
                save({ cadence: v });
              }}
              className="h-9 w-auto"
            >
              {(Object.keys(CADENCE_LABEL) as OptimizationCadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </Select>
          </label>
          {saving && <span className="text-xs text-muted-foreground">gespeichert ✓</span>}
        </div>
        {autoApply && cadence === 'off' && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Bitte ein Intervall wählen, damit die Automatik läuft.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      {changes && changes.length > 0 && (
        <ul className="space-y-1 rounded-md border bg-background p-3 text-sm">
          {changes.map((c, i) => (
            <li key={i} className="text-muted-foreground">
              • {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
