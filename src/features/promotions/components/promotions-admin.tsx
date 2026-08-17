'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { idleResult } from '@/lib/action-result';
import {
  upsertPromotionAction,
  deletePromotionAction,
} from '@/features/promotions/actions';
import type { Promotion } from '@/features/promotions/queries';

export function PromotionsAdmin({
  orgId,
  promotions,
}: {
  orgId: string;
  promotions: Promotion[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  async function submit(fd: FormData) {
    const res = await upsertPromotionAction(idleResult, fd);
    if (res.status === 'success') {
      setAdding(false);
      setEditId(null);
      router.refresh();
    } else {
      alert('message' in res ? res.message : 'Fehlgeschlagen.');
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Promotion löschen?')) return;
    await deletePromotionAction(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {promotions.length === 0
            ? 'Noch keine Promotions angelegt.'
            : `${promotions.length} Promotion${promotions.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setEditId(null);
          }}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {adding ? 'Abbrechen' : '+ Neue Promotion'}
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border p-4">
          <PromotionForm orgId={orgId} onSubmit={submit} />
        </div>
      )}

      <div className="space-y-2">
        {promotions.map((p) => (
          <div key={p.id} className="rounded-lg border">
            <div className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {p.icon ? `${p.icon} ` : ''}
                  {p.title}
                  {!p.active && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] align-middle">
                      inaktiv
                    </span>
                  )}
                </div>
                {p.conditions && (
                  <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                    {p.conditions}
                  </p>
                )}
                {p.validUntil && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    gültig bis {p.validUntil}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setEditId((id) => (id === p.id ? null : p.id));
                    setAdding(false);
                  }}
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                >
                  {editId === p.id ? 'Zu' : 'Bearbeiten'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Promotion löschen"
                >
                  ✕
                </button>
              </div>
            </div>
            {editId === p.id && (
              <div className="border-t p-4">
                <PromotionForm orgId={orgId} promotion={p} onSubmit={submit} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromotionForm({
  orgId,
  promotion: p,
  onSubmit,
}: {
  orgId: string;
  promotion?: Promotion;
  onSubmit: (fd: FormData) => void;
}) {
  const [icon, setIcon] = useState(p?.icon ?? '');
  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {p ? (
        <input type="hidden" name="id" value={p.id} />
      ) : (
        <input type="hidden" name="orgId" value={orgId} />
      )}

      <Field label="Titel der Aktion" full>
        <input
          name="title"
          required
          defaultValue={p?.title}
          className={inputCls}
          placeholder="z. B. 400 € Google Ads Werbebudget gratis"
        />
      </Field>

      <Field label="Icon">
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <input
            name="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            className="w-16 rounded-md border bg-background px-2 py-1.5 text-center text-lg"
            placeholder="🎁"
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

      <Field label="Gültig bis (optional)">
        <input
          name="validUntil"
          type="date"
          defaultValue={p?.validUntil ?? ''}
          className={inputCls}
        />
      </Field>

      <Field label="Konditionen (werden unter dem Titel angezeigt)" full>
        <textarea
          name="conditions"
          rows={3}
          defaultValue={p?.conditions}
          className={inputCls}
          placeholder="z. B. Bei Abschluss einer Google-Ads-Betreuung. Budget wird über die ersten 3 Monate verrechnet."
        />
      </Field>

      <Field label="Reihenfolge">
        <input
          name="position"
          type="number"
          defaultValue={p?.position ?? 0}
          className={inputCls}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={p?.active ?? true} />
        Aktiv (wird ausgespielt)
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Speichern
        </button>
      </div>
    </form>
  );
}

const inputCls = 'mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm';

const ICON_SUGGESTIONS = [
  '🎁', '💸', '🔥', '⭐', '🚀', '🎯', '📣', '💰', '🏷️', '✨', '🎉', '⚡',
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
