import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listLeads } from '@/features/leads/queries';
import { LeadsBoard } from '@/features/leads/components/leads-board';
import { NewLeadButton } from '@/features/leads/components/new-lead-button';
import { formatEuroCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  await requireAgencyPage();
  const leads = await listLeads();

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
        <div className="flex items-center gap-2">
          <a
            href="/app/pakete"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            🧩 Module &amp; Preise
          </a>
          <a
            href="/app/promotions"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            🎁 Promotions
          </a>
          <NewLeadButton />
        </div>
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

      <p className="text-xs text-muted-foreground">
        Tipp: Karten per Drag &amp; Drop zwischen den Spalten verschieben.
      </p>
      <LeadsBoard leads={leads} />
    </div>
  );
}
