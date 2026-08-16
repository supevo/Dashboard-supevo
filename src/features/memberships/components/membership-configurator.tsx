'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { formatEuroCents } from '@/lib/money';
import {
  moduleMonthlyCents,
  totalMonthlyCents,
  groupByCategory,
  type ModuleDef,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';
import {
  saveMembershipConfigAction,
  savePortalMembershipConfigAction,
  cancelPendingMembershipChangeAction,
} from '@/features/memberships/configurator-actions';
import { saveLeadOfferAction } from '@/features/leads/actions';

type SelState = { enabled: boolean; qty: number; budgetCents: number };
type SelMap = Record<string, SelState>;

function toMap(modules: ModuleDef[], selections: ModuleSelection[]): SelMap {
  const map: SelMap = {};
  for (const def of modules) {
    const found = selections.find((s) => s.id === def.key);
    const defaultQty = def.pricing.kind === 'per_unit' ? def.pricing.defaultQty : 1;
    map[def.key] = {
      enabled: found?.enabled ?? false,
      qty: found?.qty ?? defaultQty,
      budgetCents: found?.budgetCents ?? 0,
    };
  }
  return map;
}
function toSelections(modules: ModuleDef[], map: SelMap): ModuleSelection[] {
  return modules.map((def) => ({
    id: def.key,
    enabled: map[def.key]?.enabled ?? false,
    qty: map[def.key]?.qty,
    budgetCents: map[def.key]?.budgetCents,
  }));
}

export function MembershipConfigurator({
  modules,
  clientCompanyId,
  leadId,
  initialSelections,
  priceContext,
  pending,
  mode = 'agency',
  readOnly = false,
}: {
  modules: ModuleDef[];
  clientCompanyId?: string;
  leadId?: string;
  initialSelections: ModuleSelection[];
  priceContext: PriceContext;
  pending: { netCents: number; effectiveDate: string; name: string } | null;
  mode?: 'agency' | 'portal' | 'lead';
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [map, setMap] = useState<SelMap>(() => toMap(modules, initialSelections));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const selections = useMemo(() => toSelections(modules, map), [modules, map]);
  const total = useMemo(
    () => totalMonthlyCents(modules, selections, priceContext),
    [modules, selections, priceContext],
  );
  const groups = useMemo(() => groupByCategory(modules), [modules]);

  function toggle(key: string, enabled: boolean) {
    setMap((m) => ({ ...m, [key]: { ...m[key]!, enabled } }));
  }
  function setQty(key: string, qty: number) {
    setMap((m) => ({ ...m, [key]: { ...m[key]!, qty: Math.max(0, qty) } }));
  }
  function setBudget(key: string, euros: number) {
    setMap((m) => ({
      ...m,
      [key]: { ...m[key]!, budgetCents: Math.max(0, Math.round(euros * 100)) },
    }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const stage = map['supevo_stage2']?.enabled ? 2 : 1;
    const res =
      mode === 'lead'
        ? await saveLeadOfferAction({ leadId, selections })
        : mode === 'portal'
          ? await savePortalMembershipConfigAction({ stage, selections })
          : await saveMembershipConfigAction({ clientCompanyId, stage, selections });
    setBusy(false);
    setMsg({ ok: res.status === 'success', text: 'message' in res ? res.message ?? '' : '' });
    if (res.status === 'success') router.refresh();
  }

  async function cancelPending() {
    if (!clientCompanyId) return;
    setBusy(true);
    await cancelPendingMembershipChangeAction(clientCompanyId);
    setBusy(false);
    router.refresh();
  }

  if (modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Module angelegt. Lege sie im Backend unter „Pakete &amp;
        Module“ an.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Live-Preis (grün) */}
      <div className="rounded-lg border bg-emerald-500/5 p-4">
        <p className="text-xs text-muted-foreground">Monatlicher Preis (netto)</p>
        <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
          {formatEuroCents(total)}
        </p>
        <p className="text-xs text-muted-foreground">zzgl. MwSt.</p>
      </div>

      {pending && (
        <Alert className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            📅 Geplante Änderung: <strong>{formatEuroCents(pending.netCents)}</strong>{' '}
            netto ab {pending.effectiveDate}.
          </span>
          {mode === 'agency' && (
            <button
              type="button"
              onClick={cancelPending}
              disabled={busy}
              className="text-muted-foreground underline hover:text-rose-600 disabled:opacity-50"
            >
              verwerfen
            </button>
          )}
        </Alert>
      )}

      {/* Module nach Kategorie */}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.category ?? '—'} className="space-y-2">
            {g.category && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.category}
              </h3>
            )}
            {g.modules.map((def) => (
              <ModuleRow
                key={def.key}
                def={def}
                state={map[def.key]!}
                readOnly={readOnly}
                lineCents={moduleMonthlyCents(
                  def,
                  { id: def.key, enabled: map[def.key]!.enabled, qty: map[def.key]!.qty },
                  priceContext,
                )}
                onToggle={(en) => toggle(def.key, en)}
                onQty={(q) => setQty(def.key, q)}
                onBudget={(e) => setBudget(def.key, e)}
              />
            ))}
          </div>
        ))}
      </div>

      {readOnly ? (
        <p className="text-xs text-muted-foreground">
          Dies ist Ihr aktuelles Paket. Zum Anpassen wenden Sie sich bitte an
          supevo – sobald wir die Selbstbedienung freischalten, können Sie die
          Module hier selbst ändern.
        </p>
      ) : (
        <>
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
            {mode === 'lead'
              ? 'Ihr individuell zusammengestelltes Paket. Alle Preise verstehen sich netto zzgl. MwSt.'
              : mode === 'portal'
                ? 'Änderungen gelten immer ab dem Folgemonat. Ein abgewähltes Modul bedeutet: die enthaltenen laufenden Maßnahmen werden ab dann nicht mehr weitergeführt.'
                : 'Erste Einrichtung wird sofort aktiv. Spätere Änderungen gelten immer erst ab dem Folgemonat. Ein abgewähltes Modul bedeutet: die enthaltenen laufenden Maßnahmen werden ab dann nicht mehr weitergeführt.'}
          </p>
        </>
      )}
    </div>
  );
}

function ModuleRow({
  def,
  state,
  lineCents,
  readOnly,
  onToggle,
  onQty,
  onBudget,
}: {
  def: ModuleDef;
  state: SelState;
  lineCents: number;
  readOnly: boolean;
  onToggle: (enabled: boolean) => void;
  onQty: (qty: number) => void;
  onBudget: (euros: number) => void;
}) {
  const perUnit = def.pricing.kind === 'per_unit';
  return (
    <div
      role="button"
      aria-pressed={state.enabled}
      tabIndex={readOnly ? -1 : 0}
      onClick={() => !readOnly && onToggle(!state.enabled)}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(!state.enabled);
        }
      }}
      className={`rounded-lg border p-3 transition ${readOnly ? '' : 'cursor-pointer hover:border-emerald-500/40'} ${
        state.enabled
          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
          : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="text-sm font-medium">
            {def.icon && <span className="mr-1.5">{def.icon}</span>}
            {def.label}
          </span>
          {def.description && (
            <span className="block text-xs text-muted-foreground">
              {def.description}
            </span>
          )}
        </span>
        <span className="whitespace-nowrap text-sm font-semibold">
          {state.enabled ? formatEuroCents(lineCents) : '—'}
        </span>
      </div>

      {state.enabled && (perUnit || def.captureBudget) && (
        <div
          className="mt-2 flex flex-wrap items-center gap-4 pl-7"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {perUnit && def.pricing.kind === 'per_unit' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">
                {def.pricing.unitLabel}:
              </span>
              <button
                type="button"
                onClick={() => onQty(state.qty - 1)}
                disabled={readOnly}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{state.qty}</span>
              <button
                type="button"
                onClick={() => onQty(state.qty + 1)}
                disabled={readOnly}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
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
                disabled={readOnly}
                value={state.budgetCents ? state.budgetCents / 100 : ''}
                onChange={(e) => onBudget(Number(e.target.value) || 0)}
                className="w-24 rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-70"
                placeholder="0"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
