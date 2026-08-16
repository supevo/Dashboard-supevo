'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { formatEuroCents } from '@/lib/money';
import {
  MEMBERSHIP_MODULES,
  MEMBERSHIP_PRESETS,
  moduleMonthlyCents,
  totalMonthlyCents,
  type ModuleDef,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';
import {
  saveMembershipConfigAction,
  cancelPendingMembershipChangeAction,
} from '@/features/memberships/configurator-actions';

type SelMap = Record<string, { enabled: boolean; qty: number; budgetCents: number }>;

function toMap(selections: ModuleSelection[]): SelMap {
  const map: SelMap = {};
  for (const def of MEMBERSHIP_MODULES) {
    const found = selections.find((s) => s.id === def.id);
    const defaultQty =
      def.pricing.kind === 'per_unit' ? def.pricing.defaultQty : 1;
    map[def.id] = {
      enabled: found?.enabled ?? false,
      qty: found?.qty ?? defaultQty,
      budgetCents: found?.budgetCents ?? 0,
    };
  }
  return map;
}

function toSelections(map: SelMap): ModuleSelection[] {
  return MEMBERSHIP_MODULES.map((def) => ({
    id: def.id,
    enabled: map[def.id]!.enabled,
    qty: map[def.id]!.qty,
    budgetCents: map[def.id]!.budgetCents,
  }));
}

export function MembershipConfigurator({
  clientCompanyId,
  initialSelections,
  initialName,
  priceContext,
  pending,
}: {
  clientCompanyId: string;
  initialSelections: ModuleSelection[];
  initialName: string;
  priceContext: PriceContext;
  pending: { netCents: number; effectiveDate: string; name: string } | null;
}) {
  const router = useRouter();
  const [map, setMap] = useState<SelMap>(() => toMap(initialSelections));
  const [name, setName] = useState(initialName || 'Individuell');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const selections = useMemo(() => toSelections(map), [map]);
  const total = useMemo(
    () => totalMonthlyCents(selections, priceContext),
    [selections, priceContext],
  );

  function applyPreset(id: string) {
    const preset = MEMBERSHIP_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setMap(toMap(preset.selections));
    setName(preset.label);
  }
  function toggle(id: string, enabled: boolean) {
    setMap((m) => ({ ...m, [id]: { ...m[id]!, enabled } }));
  }
  function setQty(id: string, qty: number) {
    setMap((m) => ({ ...m, [id]: { ...m[id]!, qty: Math.max(0, qty) } }));
  }
  function setBudget(id: string, euros: number) {
    setMap((m) => ({
      ...m,
      [id]: { ...m[id]!, budgetCents: Math.max(0, Math.round(euros * 100)) },
    }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const stage = map['supevo_stage2']?.enabled ? 2 : 1;
    const res = await saveMembershipConfigAction({
      clientCompanyId,
      name,
      stage,
      selections,
    });
    setBusy(false);
    setMsg({ ok: res.status === 'success', text: 'message' in res ? res.message ?? '' : '' });
    if (res.status === 'success') router.refresh();
  }

  async function cancelPending() {
    setBusy(true);
    await cancelPendingMembershipChangeAction(clientCompanyId);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Vorlage:</span>
        {MEMBERSHIP_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Live-Preis (grün) */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-emerald-500/5 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Monatlicher Preis (netto)</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatEuroCents(total)}
          </p>
          <p className="text-xs text-muted-foreground">zzgl. MwSt.</p>
        </div>
        <div className="min-w-[12rem]">
          <label className="text-xs text-muted-foreground">Name der Mitgliedschaft</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            placeholder="Individuell"
          />
        </div>
      </div>

      {pending && (
        <Alert className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            📅 Geplante Änderung: <strong>{formatEuroCents(pending.netCents)}</strong>{' '}
            netto ab {pending.effectiveDate} ({pending.name}).
          </span>
          <button
            type="button"
            onClick={cancelPending}
            disabled={busy}
            className="text-muted-foreground underline hover:text-rose-600 disabled:opacity-50"
          >
            verwerfen
          </button>
        </Alert>
      )}

      {/* Module */}
      <div className="space-y-2">
        {MEMBERSHIP_MODULES.map((def) => (
          <ModuleRow
            key={def.id}
            def={def}
            state={map[def.id]!}
            lineCents={moduleMonthlyCents(
              { id: def.id, enabled: map[def.id]!.enabled, qty: map[def.id]!.qty },
              priceContext,
            )}
            onToggle={(en) => toggle(def.id, en)}
            onQty={(q) => setQty(def.id, q)}
            onBudget={(e) => setBudget(def.id, e)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? 'Speichere …' : 'Speichern'}
        </Button>
        {msg && (
          <Alert className={`py-1 text-xs ${msg.ok ? '' : 'text-destructive'}`}>
            {msg.text}
          </Alert>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Erste Einrichtung wird sofort aktiv. Spätere Änderungen gelten immer erst
        ab dem Folgemonat. Ein abgewähltes Modul bedeutet: die enthaltenen
        laufenden Maßnahmen werden ab dann nicht mehr weitergeführt.
      </p>
    </div>
  );
}

function ModuleRow({
  def,
  state,
  lineCents,
  onToggle,
  onQty,
  onBudget,
}: {
  def: ModuleDef;
  state: { enabled: boolean; qty: number; budgetCents: number };
  lineCents: number;
  onToggle: (enabled: boolean) => void;
  onQty: (qty: number) => void;
  onBudget: (euros: number) => void;
}) {
  const perUnit = def.pricing.kind === 'per_unit';
  return (
    <div
      className={`rounded-lg border p-3 ${
        state.enabled ? 'border-emerald-500/40 bg-emerald-500/5' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-sm font-medium">{def.label}</span>
            <span className="block text-xs text-muted-foreground">
              {def.description}
            </span>
          </span>
        </label>
        <span className="whitespace-nowrap text-sm font-semibold">
          {state.enabled ? formatEuroCents(lineCents) : '—'}
        </span>
      </div>

      {state.enabled && (perUnit || def.captureBudget) && (
        <div className="mt-2 flex flex-wrap items-center gap-4 pl-6">
          {perUnit && def.pricing.kind === 'per_unit' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">
                {def.pricing.unitLabel}:
              </span>
              <button
                type="button"
                onClick={() => onQty(state.qty - 1)}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{state.qty}</span>
              <button
                type="button"
                onClick={() => onQty(state.qty + 1)}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted"
              >
                +
              </button>
            </div>
          )}
          {def.captureBudget && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">
                Werbebudget €/Monat (an Google):
              </span>
              <input
                type="number"
                min={0}
                value={state.budgetCents ? state.budgetCents / 100 : ''}
                onChange={(e) => onBudget(Number(e.target.value) || 0)}
                className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
                placeholder="0"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
