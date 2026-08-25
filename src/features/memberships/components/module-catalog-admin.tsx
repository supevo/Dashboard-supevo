'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import {
  upsertCategoryAction,
  deleteCategoryAction,
  upsertModuleAction,
  deleteModuleAction,
} from '@/features/memberships/catalog-actions';
import type {
  AdminCatalog,
  AdminCategory,
  AdminModule,
} from '@/features/memberships/catalog-queries';

export function ModuleCatalogAdmin({
  orgId,
  catalog,
}: {
  orgId: string;
  catalog: AdminCatalog;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  async function submitModule(fd: FormData) {
    const res = await upsertModuleAction(idleResult, fd);
    if (res.status === 'success') {
      setAdding(false);
      setEditId(null);
      router.refresh();
    } else {
      alert('message' in res ? res.message : 'Fehlgeschlagen.');
    }
  }
  async function removeModule(id: string) {
    if (!window.confirm('Modul löschen?')) return;
    await deleteModuleAction(id);
    router.refresh();
  }
  async function submitCategory(fd: FormData) {
    await upsertCategoryAction(idleResult, fd);
    router.refresh();
  }
  async function removeCategory(id: string) {
    if (!window.confirm('Kategorie löschen? Module bleiben erhalten (ohne Kategorie).')) return;
    await deleteCategoryAction(id);
    router.refresh();
  }

  const byCat = new Map<string | null, AdminModule[]>();
  for (const m of catalog.modules) {
    const k = m.categoryId ?? null;
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(m);
  }

  return (
    <div className="space-y-8">
      {/* Kategorien */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Kategorien</h2>
        <div className="flex flex-wrap items-center gap-2">
          {catalog.categories.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {c.name}
              <button
                type="button"
                onClick={() => removeCategory(c.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Kategorie löschen"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <form action={submitCategory} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="block text-xs text-muted-foreground">Neue Kategorie</label>
            <input
              name="name"
              required
              className="mt-1 rounded-md border bg-background px-2 py-1.5 text-sm"
              placeholder="z. B. SEO"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Reihenfolge</label>
            <input
              name="position"
              type="number"
              defaultValue={catalog.categories.length}
              className="mt-1 w-24 rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Hinzufügen
          </button>
        </form>
      </section>

      {/* Module */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Module</h2>
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setEditId(null);
            }}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {adding ? 'Abbrechen' : '+ Neues Modul'}
          </button>
        </div>

        {adding && (
          <div className="rounded-lg border p-4">
            <ModuleForm
              orgId={orgId}
              categories={catalog.categories}
              modules={catalog.modules}
              onSubmit={submitModule}
            />
          </div>
        )}

        {catalog.categories
          .map((c) => ({ cat: c as AdminCategory | null, mods: byCat.get(c.id) ?? [] }))
          .concat([{ cat: null, mods: byCat.get(null) ?? [] }])
          .filter((g) => g.mods.length > 0)
          .map((g) => (
            <div key={g.cat?.id ?? 'none'} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.cat?.name ?? 'Ohne Kategorie'}
              </h3>
              {g.mods.map((m) => (
                <div key={m.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <span className="text-sm font-medium">
                        {m.icon ? `${m.icon} ` : ''}
                        {m.label}
                      </span>
                      {!m.active && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          inaktiv
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {m.pricingKind === 'stage'
                          ? 'Stage-Preis (aus Billing-Settings)'
                          : m.pricingKind === 'per_unit'
                            ? `${formatEuroCents(m.netCents)} / ${m.unitLabel ?? 'Einheit'}`
                            : formatEuroCents(m.netCents)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId((id) => (id === m.id ? null : m.id));
                          setAdding(false);
                        }}
                        className="rounded-md border px-2 py-1 hover:bg-muted"
                      >
                        {editId === m.id ? 'Zu' : 'Bearbeiten'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeModule(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Modul löschen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {editId === m.id && (
                    <div className="border-t p-4">
                      <ModuleForm
                        orgId={orgId}
                        categories={catalog.categories}
                        modules={catalog.modules}
                        module={m}
                        onSubmit={submitModule}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}

function ModuleForm({
  orgId,
  categories,
  modules,
  module: m,
  onSubmit,
}: {
  orgId: string;
  categories: AdminCategory[];
  modules: AdminModule[];
  module?: AdminModule;
  onSubmit: (fd: FormData) => void;
}) {
  const [kind, setKind] = useState<'flat' | 'per_unit' | 'stage'>(m?.pricingKind ?? 'flat');
  const [icon, setIcon] = useState(m?.icon ?? '');
  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {m ? (
        <input type="hidden" name="id" value={m.id} />
      ) : (
        <input type="hidden" name="orgId" value={orgId} />
      )}

      <Field label="Bezeichnung">
        <input name="label" required defaultValue={m?.label} className={inputCls} />
      </Field>

      <Field label="Icon">
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <input
            name="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            className="w-16 rounded-md border bg-background px-2 py-1.5 text-center text-lg"
            placeholder="🌐"
          />
          {ICON_SUGGESTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className={`rounded border px-1.5 py-1 text-lg hover:bg-muted ${
                icon === e ? 'border-primary bg-primary/10' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Kategorie">
        <select name="categoryId" defaultValue={m?.categoryId ?? ''} className={inputCls}>
          <option value="">— ohne —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Beschreibung" full>
        <input name="description" defaultValue={m?.description} className={inputCls} />
      </Field>

      <Field label="Checkliste – was ist enthalten? (eine Zeile pro Punkt, max. 5 im Frontend)" full>
        <textarea
          name="features"
          rows={4}
          defaultValue={(m?.features ?? []).join('\n')}
          className={inputCls}
          placeholder={'z. B.\nIndividuelles Design\nFür Handy optimiert\nSEO-Grundlagen'}
        />
      </Field>

      <Field label="Preis-Typ">
        <select
          name="pricingKind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={inputCls}
        >
          <option value="flat">Fixpreis</option>
          <option value="per_unit">Pro Einheit (× Menge)</option>
          <option value="stage">supevo-Stage (Preis aus Billing-Settings)</option>
        </select>
      </Field>

      {kind !== 'stage' && (
        <Field label="Preis (€ netto)">
          <input
            name="netEuros"
            defaultValue={m ? (m.netCents / 100).toFixed(2).replace('.', ',') : ''}
            className={inputCls}
            placeholder="z. B. 245"
          />
        </Field>
      )}

      {kind === 'stage' && (
        <Field label="Stage">
          <select name="stage" defaultValue={m?.stage ?? 1} className={inputCls}>
            <option value={1}>Stage 1</option>
            <option value={2}>Stage 2</option>
          </select>
        </Field>
      )}

      {kind === 'per_unit' && (
        <>
          <Field label="Einheit (Label)">
            <input name="unitLabel" defaultValue={m?.unitLabel ?? ''} className={inputCls} placeholder="Beiträge/Monat" />
          </Field>
          <Field label="Standardmenge">
            <input name="defaultQty" type="number" defaultValue={m?.defaultQty ?? 1} className={inputCls} />
          </Field>
          <Field label="Min. Menge">
            <input name="minQty" type="number" defaultValue={m?.minQty ?? 0} className={inputCls} />
          </Field>
          <Field label="Max. Menge">
            <input name="maxQty" type="number" defaultValue={m?.maxQty ?? 99} className={inputCls} />
          </Field>
        </>
      )}

      <Field label="Reihenfolge">
        <input name="position" type="number" defaultValue={m?.position ?? 0} className={inputCls} />
      </Field>

      {/* Zusatz-Optionen (v. a. für Google Ads) */}
      <div className="sm:col-span-2 mt-1 space-y-3 rounded-lg border border-dashed p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Zusatz-Optionen (optional)
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="budgetViaOptions" defaultChecked={m?.budgetViaOptions ?? false} />
          Budget-Zahlweise anbieten (über uns / direkt an Google)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preis pro Keyword (€, 0 = aus)">
            <input
              name="keywordEuros"
              defaultValue={m && m.keywordCents ? (m.keywordCents / 100).toFixed(2).replace('.', ',') : ''}
              className={inputCls}
              placeholder="z. B. 15"
            />
          </Field>
          <Field label="Keywords Standardanzahl">
            <input name="keywordDefault" type="number" defaultValue={m?.keywordDefault ?? 0} className={inputCls} />
          </Field>
          <Field label="Add-on-Module (mehrere möglich)" full>
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {modules.filter((mod) => mod.key !== m?.key).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine anderen Module vorhanden.
                </p>
              ) : (
                modules
                  .filter((mod) => mod.key !== m?.key)
                  .map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="addonModuleKeys"
                        value={mod.key}
                        defaultChecked={(m?.addonModuleKeys ?? []).includes(mod.key)}
                      />
                      <span>
                        {mod.icon ? `${mod.icon} ` : ''}
                        {mod.label}
                      </span>
                    </label>
                  ))
              )}
            </div>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="addonRequired" defaultChecked={m?.addonRequired ?? false} />
          Add-ons sind Pflicht / Must-Have (werden beim Aktivieren automatisch mit gewählt)
        </label>
      </div>

      {/* Umsetzung: „Aus Angebot erzeugen" (Marketingplan & Aufgaben) */}
      <div className="sm:col-span-2 mt-1 space-y-3 rounded-lg border border-dashed p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {'Umsetzung – „Aus Angebot erzeugen"'}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="planInclude" defaultChecked={m?.planInclude ?? false} />
          In den Marketingplan aufnehmen (als Maßnahme)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marketingplan-Phase (1–n, leer = Standard)">
            <input
              name="planPhase"
              type="number"
              min={1}
              defaultValue={m?.planPhase ?? ''}
              className={inputCls}
              placeholder="z. B. 1"
            />
          </Field>
          <Field label="Aufgabe erzeugen">
            <select name="taskMode" defaultValue={m?.taskMode ?? 'none'} className={inputCls}>
              <option value="none">keine Aufgabe</option>
              <option value="queue">einmalig in die Warteschlange</option>
              <option value="recurring">wiederkehrende (Dauer-)Aufgabe</option>
            </select>
          </Field>
          <Field label="Takt (nur wiederkehrend)">
            <select
              name="taskRecurringFreq"
              defaultValue={m?.taskRecurringFreq ?? 'monthly'}
              className={inputCls}
            >
              <option value="weekly">wöchentlich</option>
              <option value="monthly">monatlich</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="taskPerQty" defaultChecked={m?.taskPerQty ?? false} />
          Nach Menge vervielfachen (z. B. 2 Landingpages = 2 Aufgaben)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="taskStretchWeeks" defaultChecked={m?.taskStretchWeeks ?? false} />
          Warteschlangen-Aufgaben über die Wochen staffeln (Fälligkeiten)
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="captureBudget" defaultChecked={m?.captureBudget ?? false} />
        Werbebudget erfassen (fließt nicht in den Preis)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={m?.active ?? true} />
        Aktiv (im Baukasten sichtbar)
      </label>

      <div className="sm:col-span-2">
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Speichern
        </button>
      </div>
    </form>
  );
}

const inputCls = 'mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm';

const ICON_SUGGESTIONS = [
  '🌐', '🛠️', '📝', '🎯', '⭐', '📈', '📣', '💻', '📊', '🚀', '🎨', '🔧',
  '🖥️', '📧', '🛒', '📱', '✍️', '🔍',
];

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
