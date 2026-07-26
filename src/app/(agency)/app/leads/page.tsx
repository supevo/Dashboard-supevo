import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listLeads, LEAD_STATUSES, type LeadStatus } from '@/features/leads/queries';
import { LeadCard } from '@/features/leads/components/lead-card';
import { NewLeadButton } from '@/features/leads/components/new-lead-button';
import { formatEuroCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const COL_ACCENT: Record<LeadStatus, string> = {
  new: 'border-t-sky-400',
  contacted: 'border-t-amber-400',
  offer: 'border-t-violet-400',
  won: 'border-t-emerald-500',
  lost: 'border-t-slate-400',
};

export default async function LeadsPage() {
  await requireAgencyPage();
  const leads = await listLeads();

  const byStatus = new Map<LeadStatus, typeof leads>();
  for (const s of LEAD_STATUSES) byStatus.set(s, []);
  for (const l of leads) byStatus.get(l.status)?.push(l);

  const openValue = leads
    .filter((l) => l.status !== 'lost' && l.status !== 'won')
    .reduce((sum, l) => sum + (l.estimatedValueCents ?? 0), 0);
  const wonValue = leads
    .filter((l) => l.status === 'won')
    .reduce((sum, l) => sum + (l.estimatedValueCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{de.leads.title}</h1>
          <p className="text-sm text-muted-foreground">{de.leads.subtitle}</p>
        </div>
        <NewLeadButton />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-lg border bg-card px-4 py-2">
          <span className="text-muted-foreground">Pipeline offen: </span>
          <span className="font-semibold">{formatEuroCents(openValue)}</span>
        </div>
        <div className="rounded-lg border bg-card px-4 py-2">
          <span className="text-muted-foreground">Gewonnen: </span>
          <span className="font-semibold text-emerald-600">
            {formatEuroCents(wonValue)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[900px] gap-3">
          {LEAD_STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div key={status} className="flex w-56 shrink-0 flex-col">
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
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      {de.leads.empty}
                    </p>
                  ) : (
                    items.map((l) => <LeadCard key={l.id} lead={l} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
