import Link from 'next/link';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getAdsMonthlyBoard } from '@/features/ads-billing/queries';
import { AdsBoardPanel } from '@/features/ads-billing/components/ads-board-panel';

export const dynamic = 'force-dynamic';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Ads-Abrechnung (Meta/Google): Monatsboard je Mandat. Der zuständige Mitarbeiter
 * trägt den verbrauchten Betrag ein und hakt ab, ob der Monat abgerechnet wurde.
 */
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; monat?: string }>;
}) {
  const { orgId } = await requireAgencyPage();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.jahr) || now.getFullYear();
  const month =
    Number(sp.monat) >= 1 && Number(sp.monat) <= 12
      ? Number(sp.monat)
      : now.getMonth() + 1;

  const rows = await getAdsMonthlyBoard(orgId, year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Ads-Abrechnung</h1>
        <p className="text-sm text-muted-foreground">
          Wiederkehrende Meta/Google-Budgets, die wir auslegen – monatlich
          Verbrauch eintragen und abrechnen.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={`/app/ads?jahr=${prev.y}&monat=${prev.m}`}
          className="rounded border px-2 py-1 text-sm hover:bg-muted"
        >
          ← {MONTHS[prev.m - 1]}
        </Link>
        <div className="text-sm font-semibold">
          {MONTHS[month - 1]} {year}
        </div>
        <Link
          href={`/app/ads?jahr=${next.y}&monat=${next.m}`}
          className="rounded border px-2 py-1 text-sm hover:bg-muted"
        >
          {MONTHS[next.m - 1]} →
        </Link>
      </div>

      <AdsBoardPanel rows={rows} year={year} month={month} />
    </div>
  );
}
