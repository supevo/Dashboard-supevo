'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  estimateTaskAction,
  setManualEstimateAction,
} from '@/features/estimate/actions';
import { idleResult } from '@/lib/action-result';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';

/**
 * Aufwand einer Aufgabe: KI-Schätzung + händische Schätzung nebeneinander. Die
 * händische Schätzung überschreibt die KI (effektiver Wert = manuell ∨ KI) und
 * fließt als Lern-Beispiel in künftige KI-Schätzungen ein.
 */
export function EffortPanel({
  projectId,
  taskId,
  estimatedMinutes,
  aiEstimateMinutes,
  manualEstimateMinutes,
  actualMinutes,
  canManage,
}: {
  projectId: string;
  taskId: string;
  /** Effektiv genutzter Wert (manuell ∨ KI). */
  estimatedMinutes: number | null;
  aiEstimateMinutes: number | null;
  manualEstimateMinutes: number | null;
  actualMinutes: number;
  canManage: boolean;
}) {
  const [estState, estimate] = useActionState(estimateTaskAction, idleResult);
  const [manualState, setManual] = useActionState(setManualEstimateAction, idleResult);
  const router = useRouter();
  // Einheit der manuellen Eingabe. Ist der gespeicherte Wert ein glattes
  // Vielfaches von 60, standardmäßig in Stunden anzeigen – sonst in Minuten.
  const initUnit: 'min' | 'h' =
    manualEstimateMinutes != null && manualEstimateMinutes % 60 === 0 && manualEstimateMinutes > 0
      ? 'h'
      : 'min';
  const [unit, setUnit] = useState<'min' | 'h'>(initUnit);
  const toInput = (mins: number | null, u: 'min' | 'h') =>
    mins == null ? '' : String(u === 'h' ? mins / 60 : mins);
  const [manualInput, setManualInput] = useState(toInput(manualEstimateMinutes, initUnit));
  useEffect(() => {
    setUnit(initUnit);
    setManualInput(toInput(manualEstimateMinutes, initUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualEstimateMinutes]);
  useEffect(() => {
    if (estState.status === 'success' || manualState.status === 'success') {
      router.refresh();
    }
  }, [estState, manualState, router]);

  // Effizienz-Badge vergleicht Ist gegen den effektiven Schätzwert.
  let badge: { text: string; cls: string } | null = null;
  if (estimatedMinutes && actualMinutes > 0) {
    const ratio = actualMinutes / estimatedMinutes;
    if (ratio <= 1) badge = { text: de.effort.inTime, cls: 'bg-emerald-100 text-emerald-700' };
    else if (ratio <= 1.5) badge = { text: de.effort.slightlyOver, cls: 'bg-amber-100 text-amber-700' };
    else badge = { text: de.effort.over, cls: 'bg-red-100 text-red-700' };
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-xs text-muted-foreground">✨ KI-Schätzung</div>
          <div className="font-semibold">
            {aiEstimateMinutes ? formatMinutes(aiEstimateMinutes) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            ✍️ Manuell{manualEstimateMinutes != null ? ' (aktiv)' : ''}
          </div>
          <div className="font-semibold">
            {manualEstimateMinutes != null ? formatMinutes(manualEstimateMinutes) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{de.effort.actual}</div>
          <div className="font-semibold">{formatMinutes(actualMinutes)}</div>
        </div>
        {badge && (
          <span className={cn('rounded px-1.5 py-0.5 text-xs', badge.cls)}>
            {badge.text}
          </span>
        )}
      </div>

      {canManage && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <form action={estimate}>
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="projectId" value={projectId} />
              <SubmitButton size="sm" variant="outline">
                ✨ {de.effort.aiEstimate}
              </SubmitButton>
            </form>
            <form action={setManual} className="flex items-center gap-1">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="projectId" value={projectId} />
              <Input
                name="amount"
                type="number"
                min={0}
                max={unit === 'h' ? 80 : 4800}
                step={unit === 'h' ? 0.25 : 5}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={unit === 'h' ? 'Std.' : 'Min.'}
                className="h-8 w-20 text-sm"
              />
              <Select
                name="unit"
                value={unit}
                onChange={(e) => {
                  const next = e.target.value as 'min' | 'h';
                  // Angezeigten Wert in die neue Einheit umrechnen.
                  const cur = parseFloat(manualInput);
                  if (!Number.isNaN(cur)) {
                    const mins = unit === 'h' ? cur * 60 : cur;
                    setManualInput(String(next === 'h' ? mins / 60 : Math.round(mins)));
                  }
                  setUnit(next);
                }}
                className="h-8 w-auto text-sm"
              >
                <option value="min">Min.</option>
                <option value="h">Std.</option>
              </Select>
              <SubmitButton size="sm" variant="ghost">
                Manuell speichern
              </SubmitButton>
            </form>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Die manuelle Schätzung überschreibt die KI und hilft ihr, künftige
            Aufgaben besser einzuschätzen. Leer/0 = wieder KI verwenden.
          </p>
        </>
      )}
      {estState.status === 'error' && (
        <p className="text-xs text-destructive">{estState.message}</p>
      )}
      {manualState.status === 'error' && (
        <p className="text-xs text-destructive">{manualState.message}</p>
      )}
    </div>
  );
}
