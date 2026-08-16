'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setLeadStatusAction,
  deleteLeadAction,
} from '@/features/leads/actions';
import { idleResult } from '@/lib/action-result';
import { formatEuroCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';
import { LEAD_STATUSES, type Lead } from '@/features/leads/types';

export function LeadCard({ lead }: { lead: Lead }) {
  const [, move] = useActionState(setLeadStatusAction, idleResult);
  const [, remove] = useActionState(deleteLeadAction, idleResult);
  const router = useRouter();

  return (
    <div className="rounded-md border bg-card p-2.5 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{lead.contactName}</div>
          {lead.company && (
            <div className="truncate text-xs text-muted-foreground">
              {lead.company}
            </div>
          )}
        </div>
        <form action={remove} onSubmit={() => setTimeout(() => router.refresh(), 300)}>
          <input type="hidden" name="id" value={lead.id} />
          <button
            type="submit"
            aria-label={de.leads.delete}
            className="text-muted-foreground hover:text-destructive"
          >
            ✕
          </button>
        </form>
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

      <form
        action={move}
        onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
        onSubmit={() => setTimeout(() => router.refresh(), 300)}
        className="mt-2"
      >
        <input type="hidden" name="id" value={lead.id} />
        <select
          name="status"
          defaultValue={lead.status}
          className="h-7 w-full rounded border bg-background px-1 text-xs"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {de.leads.status[s]}
            </option>
          ))}
        </select>
      </form>

      <Link
        href={`/app/leads/${lead.id}`}
        className="mt-2 block rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-center text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
      >
        🚀 Paket / Termin
      </Link>
    </div>
  );
}
