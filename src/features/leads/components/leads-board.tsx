'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatEuroCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { de } from '@/lib/i18n/de';
import {
  moveLeadAction,
  deleteLeadAction,
  convertLeadToClientAction,
} from '@/features/leads/actions';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/features/leads/types';
import { EditLeadButton } from '@/features/leads/components/edit-lead-button';

const COL_ACCENT: Record<LeadStatus, string> = {
  new: 'border-t-sky-400',
  contacted: 'border-t-amber-400',
  offer: 'border-t-violet-400',
  won: 'border-t-emerald-500',
  lost: 'border-t-slate-400',
};

/**
 * Leads-Board mit nativem Drag & Drop (wie die übrigen Kanbans). Karte in eine
 * Spalte ziehen = Status ändern (optimistisch + Server). Interne Aktionen
 * (übernehmen, löschen) leben hier, NICHT auf der Kunden-Termin-Seite.
 */
export function LeadsBoard({ leads: initial }: { leads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  async function moveTo(status: LeadStatus) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    const res = await moveLeadAction(id, status);
    if (res.status !== 'success') {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: lead.status } : l)));
    }
  }

  async function remove(id: string) {
    setLeads((ls) => ls.filter((l) => l.id !== id));
    await deleteLeadAction({ status: 'idle' }, formData({ id }));
    router.refresh();
  }

  async function convert(id: string) {
    if (
      !window.confirm(
        'Diesen Lead als Kunden übernehmen? Es wird ein Kundenunternehmen und eine Mitgliedschaft aus dem gespeicherten Paket angelegt.',
      )
    ) {
      return;
    }
    const res = await convertLeadToClientAction(id);
    if (res.status === 'success') {
      const clientId = (res.data as { id?: string } | undefined)?.id ?? null;
      setLeads((ls) =>
        ls.map((l) =>
          l.id === id ? { ...l, status: 'won', convertedClientCompanyId: clientId } : l,
        ),
      );
      router.refresh();
    } else {
      alert('message' in res ? res.message : 'Übernahme fehlgeschlagen.');
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[900px] gap-3">
        {LEAD_STATUSES.map((status) => {
          const items = leads.filter((l) => l.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveTo(status)}
              className="flex w-56 shrink-0 flex-col"
            >
              <div
                className={cn(
                  'mb-2 rounded-md border border-t-4 bg-muted/30 px-2 py-1.5',
                  COL_ACCENT[status],
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {de.leads.status[status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </div>
              </div>
              <div className="min-h-[60px] space-y-2">
                {items.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    {de.leads.empty}
                  </p>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onDragStart={() => setDragId(lead.id)}
                      onDelete={() => remove(lead.id)}
                      onConvert={() => convert(lead.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small helper to build a FormData for the existing delete action. */
function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function LeadCard({
  lead,
  onDragStart,
  onDelete,
  onConvert,
}: {
  lead: Lead;
  onDragStart: () => void;
  onDelete: () => void;
  onConvert: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="cursor-grab rounded-md border bg-card p-2.5 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{lead.contactName}</div>
          {lead.company && (
            <div className="truncate text-xs text-muted-foreground">
              {lead.company}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <EditLeadButton lead={lead} />
          <button
            type="button"
            onClick={onDelete}
            aria-label={de.leads.delete}
            className="text-muted-foreground hover:text-destructive"
          >
            ✕
          </button>
        </div>
      </div>

      {(lead.email || lead.phone) && (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {lead.email && <div className="truncate">✉ {lead.email}</div>}
          {lead.phone && <div className="truncate">☎ {lead.phone}</div>}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {lead.source && (
          <span className="rounded bg-muted px-1 py-0.5">{lead.source}</span>
        )}
        {lead.estimatedValueCents != null && (
          <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-700">
            {formatEuroCents(lead.estimatedValueCents)}
          </span>
        )}
      </div>

      {lead.note && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {lead.note}
        </p>
      )}

      <div className="mt-2 space-y-1">
        <Link
          href={`/app/leads/${lead.id}`}
          className="block rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-center text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
        >
          🚀 Paket / Termin
        </Link>
        {lead.convertedClientCompanyId ? (
          <Link
            href={`/app/clients/${lead.convertedClientCompanyId}`}
            className="block rounded border px-2 py-1 text-center text-xs font-medium hover:bg-muted"
          >
            ✅ Kunde – öffnen →
          </Link>
        ) : (
          lead.status === 'won' && (
            <button
              type="button"
              onClick={onConvert}
              className="block w-full rounded border px-2 py-1 text-center text-xs font-medium hover:bg-muted"
            >
              → In Kunde übernehmen
            </button>
          )
        )}
      </div>
    </div>
  );
}
