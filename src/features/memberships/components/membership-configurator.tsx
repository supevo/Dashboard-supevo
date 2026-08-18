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
import { promoDiscountCents } from '@/features/promotions/discount';

type SelState = {
  enabled: boolean;
  qty: number;
  budgetCents: number;
  budgetVia: 'us' | 'google';
  keywords: number;
};
type SelMap = Record<string, SelState>;

/** Aktuelle Aktion (Promotion), die über dem Baukasten angezeigt wird. */
export type PromoBanner = {
  id: string;
  title: string;
  conditions: string;
  icon: string | null;
  discountKind: 'none' | 'fixed' | 'percent';
  discountValue: number;
};

function toMap(modules: ModuleDef[], selections: ModuleSelection[]): SelMap {
  const map: SelMap = {};
  for (const def of modules) {
    const found = selections.find((s) => s.id === def.key);
    const defaultQty =
      def.pricing.kind === 'per_unit' ? Math.max(1, def.pricing.defaultQty) : 1;
    map[def.key] = {
      enabled: found?.enabled ?? false,
      qty: found?.qty ?? defaultQty,
      budgetCents: found?.budgetCents ?? 0,
      budgetVia: found?.budgetVia ?? 'us',
      keywords: found?.keywords ?? def.keywordDefault,
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
    budgetVia: map[def.key]?.budgetVia,
    keywords: map[def.key]?.keywords,
  }));
}

export function MembershipConfigurator({
  modules,
  clientCompanyId,
  leadId,
  initialSelections,
  priceContext,
  pending,
  promotions = [],
  initialRedeemed = [],
  mode = 'agency',
  readOnly = false,
  show = 'all',
}: {
  modules: ModuleDef[];
  clientCompanyId?: string;
  leadId?: string;
  initialSelections: ModuleSelection[];
  priceContext: PriceContext;
  pending: { netCents: number; effectiveDate: string; name: string } | null;
  promotions?: PromoBanner[];
  initialRedeemed?: string[];
  mode?: 'agency' | 'portal' | 'lead';
  readOnly?: boolean;
  /** 'stages' = nur supevo Stage 1/2, 'modules' = nur Baukasten-Module. */
  show?: 'all' | 'stages' | 'modules';
}) {
  const router = useRouter();
  const [map, setMap] = useState<SelMap>(() => toMap(modules, initialSelections));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [redeemed, setRedeemed] = useState<Set<string>>(
    () => new Set(initialRedeemed),
  );

  const selections = useMemo(() => toSelections(modules, map), [modules, map]);
  const total = useMemo(
    () => totalMonthlyCents(modules, selections, priceContext),
    [modules, selections, priceContext],
  );
  // Erfasstes Werbebudget aktiver Module (fließt NICHT in den Paketpreis, wird
  // aber oben transparent als „+ X Werbebudget" ausgewiesen).
  const budgetCents = useMemo(
    () =>
      modules.reduce((sum, d) => {
        const s = map[d.key];
        return d.captureBudget && s?.enabled ? sum + (s.budgetCents || 0) : sum;
      }, 0),
    [modules, map],
  );
  // Eingelöste Gutscheine mindern den Paketpreis (Werbebudget bleibt außen vor).
  const discountCents = useMemo(
    () => promoDiscountCents(total, promotions, redeemed),
    [total, promotions, redeemed],
  );
  const netAfterDiscount = Math.max(0, total - discountCents);
  const anySelected = selections.some((s) => s.enabled);
  const stageModules = useMemo(
    () => modules.filter((d) => d.pricing.kind === 'stage'),
    [modules],
  );
  const restGroups = useMemo(
    () => groupByCategory(modules.filter((d) => d.pricing.kind !== 'stage')),
    [modules],
  );
  const anyStageSelected = stageModules.some((d) => map[d.key]?.enabled);
  const hasRest = restGroups.length > 0;

  function toggle(key: string, enabled: boolean) {
    setMap((m) => {
      const next = { ...m, [key]: { ...m[key]!, enabled } };
      const def = modules.find((d) => d.key === key);
      // Stufen sind exklusiv: „Stage 1 oder Stage 2". Aktiviert man eine Stufe,
      // werden alle anderen Stufen automatisch abgewählt.
      if (enabled && def?.pricing.kind === 'stage') {
        for (const d of modules) {
          if (d.pricing.kind === 'stage' && d.key !== key && next[d.key]?.enabled) {
            next[d.key] = { ...next[d.key]!, enabled: false };
          }
        }
      }
      // Pflicht-Add-on beim Aktivieren automatisch mit aktivieren.
      if (enabled && def?.addonRequired && def.addonModuleKey && next[def.addonModuleKey]) {
        next[def.addonModuleKey] = { ...next[def.addonModuleKey]!, enabled: true };
      }
      return next;
    });
  }
  function setQty(key: string, qty: number) {
    // Menge an die echten Modulgrenzen klemmen, damit die angezeigte Zahl
    // immer der berechneten (bepreisten) Menge entspricht.
    const def = modules.find((d) => d.key === key);
    let q = Math.round(qty);
    if (def?.pricing.kind === 'per_unit') {
      const upper = def.pricing.maxQty >= 1 ? def.pricing.maxQty : 99;
      const lower = Math.max(0, Math.min(def.pricing.minQty, upper));
      q = Math.min(upper, Math.max(lower, q));
    } else {
      q = Math.max(0, q);
    }
    setMap((m) => ({ ...m, [key]: { ...m[key]!, qty: q } }));
  }
  function setBudget(key: string, euros: number) {
    setMap((m) => ({
      ...m,
      [key]: { ...m[key]!, budgetCents: Math.max(0, Math.round(euros * 100)) },
    }));
  }
  function setKeywords(key: string, n: number) {
    setMap((m) => ({ ...m, [key]: { ...m[key]!, keywords: Math.max(0, n) } }));
  }
  function setBudgetVia(key: string, via: 'us' | 'google') {
    setMap((m) => ({ ...m, [key]: { ...m[key]!, budgetVia: via } }));
  }
  function toggleRedeem(id: string) {
    setRedeemed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    // Stufe aus dem tatsächlich aktivierten Stage-Modul ableiten (statt hart am
    // Key zu hängen); Fallback 1, wenn keine Stufe gewählt ist.
    const enabledStage = modules.find(
      (d) => d.pricing.kind === 'stage' && map[d.key]?.enabled,
    );
    const stage: 1 | 2 =
      enabledStage && enabledStage.pricing.kind === 'stage'
        ? enabledStage.pricing.stage
        : 1;
    const res =
      mode === 'lead'
        ? await saveLeadOfferAction({
            leadId,
            selections,
            redeemedPromotions: [...redeemed],
          })
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

  const renderModule = (def: ModuleDef) => (
    <ModuleRow
      key={def.key}
      def={def}
      state={map[def.key]!}
      readOnly={readOnly}
      lineCents={moduleMonthlyCents(
        def,
        {
          id: def.key,
          enabled: map[def.key]!.enabled,
          qty: map[def.key]!.qty,
          keywords: map[def.key]!.keywords,
        },
        priceContext,
      )}
      addon={(() => {
        if (!def.addonModuleKey) return null;
        const am = modules.find((d) => d.key === def.addonModuleKey);
        if (!am) return null;
        return {
          label: `${am.icon ? `${am.icon} ` : ''}${am.label}`,
          cents: moduleMonthlyCents(
            am,
            { id: am.key, enabled: true, keywords: map[am.key]?.keywords },
            priceContext,
          ),
          enabled: map[am.key]?.enabled ?? false,
          onToggle: (on: boolean) => toggle(am.key, on),
        };
      })()}
      onToggle={(en) => toggle(def.key, en)}
      onQty={(q) => setQty(def.key, q)}
      onBudget={(e) => setBudget(def.key, e)}
      onKeywords={(n) => setKeywords(def.key, n)}
      onBudgetVia={(v) => setBudgetVia(def.key, v)}
    />
  );

  return (
    <div className="space-y-6">
      {/* Aktuelle Aktionen (Promotions/Gutscheine) – nur im Lead-Angebot. */}
      {mode === 'lead' && promotions.length > 0 && (
        <div className="space-y-2">
          {promotions.map((p) => {
            const isRedeemed = redeemed.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                  isRedeemed
                    ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40'
                    : 'border-emerald-500/40 bg-emerald-500/10'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-lg leading-none" aria-hidden>
                    {p.icon || '🎁'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {p.title}
                    </div>
                    {p.conditions && (
                      <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                        {p.conditions}
                      </div>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleRedeem(p.id)}
                    className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                      isRedeemed
                        ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'
                    }`}
                  >
                    {isRedeemed ? '✓ Eingelöst' : 'Einlösen'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preis erst nach der ersten Auswahl – vorher einladender Einstieg. */}
      {anySelected ? (
        <div className="rounded-lg border bg-emerald-500/5 p-4">
          <p className="text-xs text-muted-foreground">Monatlicher Preis (netto)</p>
          <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatEuroCents(netAfterDiscount)}
            {budgetCents > 0 && (
              <span className="text-lg font-semibold text-foreground/70">
                {' + '}
                {formatEuroCents(budgetCents)} Werbebudget
              </span>
            )}
          </p>
          {discountCents > 0 && (
            <p className="text-xs text-muted-foreground">
              Paketpreis {formatEuroCents(total)} · Gutschein −
              {formatEuroCents(discountCents)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            zzgl. MwSt.
            {budgetCents > 0 && ' · Werbebudget wird separat abgerechnet.'}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-bold">Ihr individuelles Marketingpaket</h2>
          <p className="mt-1 text-muted-foreground">
            Wählen wir gemeinsam die Bausteine aus, die für Ihr Ziel sinnvoll sind.
          </p>
        </div>
      )}

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

      {anyStageSelected && (
        <Alert className="text-xs">
          ✅ Komplettbetreuung gewählt – einzelne Module sind bereits über die
          Mitgliedschaft abgedeckt.
        </Alert>
      )}

      {/* Komplettbetreuung (supevo-Mitgliedschaften) */}
      {show !== 'modules' && stageModules.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Komplettbetreuung</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {stageModules.map(renderModule)}
          </div>
        </section>
      )}

      {show === 'all' && stageModules.length > 0 && hasRest && (
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          oder
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Individuelles Marketingpaket (einzelne Bausteine) */}
      {show !== 'stages' && hasRest && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Individuelles Marketingpaket</h3>
          {restGroups.map((g) => (
            <div key={g.category ?? '—'} className="space-y-2">
              {g.category && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.category}
                </h4>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {g.modules.map(renderModule)}
              </div>
            </div>
          ))}
        </section>
      )}

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
  addon,
  onToggle,
  onQty,
  onBudget,
  onKeywords,
  onBudgetVia,
}: {
  def: ModuleDef;
  state: SelState;
  lineCents: number;
  readOnly: boolean;
  /** Verknüpftes Add-on-Modul (falls konfiguriert). */
  addon: {
    label: string;
    cents: number;
    enabled: boolean;
    onToggle: (on: boolean) => void;
  } | null;
  onToggle: (enabled: boolean) => void;
  onQty: (qty: number) => void;
  onBudget: (euros: number) => void;
  onKeywords: (n: number) => void;
  onBudgetVia: (via: 'us' | 'google') => void;
}) {
  const perUnit = def.pricing.kind === 'per_unit';
  const hasExtras =
    perUnit ||
    def.captureBudget ||
    def.budgetViaOptions ||
    def.keywordCents > 0 ||
    !!addon;
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

      {def.features.length > 0 && (
        <ul className="mt-2 space-y-1">
          {def.features.slice(0, 5).map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {state.enabled && hasExtras && (
        <div
          className="mt-2 flex flex-wrap items-center gap-4 pl-7"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {def.keywordCents > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">Keywords:</span>
              <button
                type="button"
                onClick={() => onKeywords(state.keywords - 1)}
                disabled={readOnly}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{state.keywords}</span>
              <button
                type="button"
                onClick={() => onKeywords(state.keywords + 1)}
                disabled={readOnly}
                className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                +
              </button>
              <span className="text-xs text-muted-foreground">
                (+{formatEuroCents(def.keywordCents)}/Keyword)
              </span>
            </div>
          )}

          {def.budgetViaOptions && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground">Werbebudget zahlt:</span>
              <select
                value={state.budgetVia}
                disabled={readOnly}
                onChange={(e) => onBudgetVia(e.target.value as 'us' | 'google')}
                className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-70"
              >
                <option value="google">direkt an Google</option>
                <option value="us">über uns</option>
              </select>
            </label>
          )}

          {addon &&
            (def.addonRequired ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                inkl. {addon.label} (+{formatEuroCents(addon.cents)}) · Must-Have
              </span>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addon.enabled}
                  disabled={readOnly}
                  onChange={(e) => addon.onToggle(e.target.checked)}
                />
                <span>
                  {addon.label}{' '}
                  <span className="text-xs text-muted-foreground">
                    (+{formatEuroCents(addon.cents)})
                  </span>
                </span>
              </label>
            ))}

          {perUnit && def.pricing.kind === 'per_unit' && (() => {
            const upper = def.pricing.maxQty >= 1 ? def.pricing.maxQty : 99;
            const lower = Math.max(0, Math.min(def.pricing.minQty, upper));
            return (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">
                  {def.pricing.unitLabel}:
                </span>
                <button
                  type="button"
                  onClick={() => onQty(state.qty - 1)}
                  disabled={readOnly || state.qty <= lower}
                  className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-8 text-center font-medium">{state.qty}</span>
                <button
                  type="button"
                  onClick={() => onQty(state.qty + 1)}
                  disabled={readOnly || state.qty >= upper}
                  className="h-6 w-6 rounded border text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  +
                </button>
                {state.qty >= upper && (
                  <span className="text-xs text-muted-foreground">(max. {upper})</span>
                )}
              </div>
            );
          })()}
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
