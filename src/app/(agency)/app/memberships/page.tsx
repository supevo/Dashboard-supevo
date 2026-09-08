import { Card, CardContent } from '@/components/ui/card';
import { requireSuperAdminPage } from '@/lib/authz/page-guards';
import { listMembershipsForOverview } from '@/features/billing/memberships-list-queries';
import { MembershipsTable } from '@/features/billing/components/memberships-table';
import { MembershipsProfitEstimate } from '@/features/billing/components/memberships-profit-estimate';
import { berlinToday } from '@/lib/time';
import { formatEuroCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

function daysUntil(iso: string | null, todayIso: string): number | null {
  if (!iso) return null;
  const a = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

/**
 * Mitgliedschaften – Überblick über alle laufenden Kundenabos (Paket, Preis,
 * Zahlweg, Start, Laufzeit, Ansprechpartner), mit „Ändern"-Link direkt in die
 * Abrechnung des Kunden. Nur Geschäftsführung (Super-Admin).
 */
export default async function MembershipsPage() {
  const { orgId } = await requireSuperAdminPage();
  const today = berlinToday();
  const period = today.slice(0, 7); // 'YYYY-MM'
  const rows = await listMembershipsForOverview(orgId, period, today);

  const active = rows.filter((r) => r.status === 'active');
  const mrrGross = active.reduce((n, r) => n + r.grossCents, 0);
  const mrrNet = active.reduce((n, r) => n + r.netCents, 0);
  const openPayments = active.filter((r) => !r.collected).length;
  const attention = rows.filter((r) => {
    if (r.status === 'canceled') return false;
    if (r.sepaMandateMissing) return true;
    if (!r.startDate) return true;
    const d = daysUntil(r.cancelDeadlineIso, today);
    return d != null && d >= 0 && d <= 60;
  }).length;

  const monthLabel = new Date(`${today}T00:00:00Z`).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  });

  const kpis: { label: string; value: string; sub?: string; tone?: string }[] = [
    { label: 'Aktive Mitgliedschaften', value: String(active.length), sub: `${rows.length} gesamt` },
    { label: 'Wiederkehrend / Monat', value: formatEuroCents(mrrGross), sub: `${formatEuroCents(mrrNet)} netto` },
    {
      label: `Offene Zahlungen (${monthLabel})`,
      value: String(openPayments),
      sub: 'noch nicht abgehakt',
      tone: openPayments > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
    },
    {
      label: 'Handlungsbedarf',
      value: String(attention),
      sub: 'Mandat fehlt / kündbar',
      tone: attention > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mitgliedschaften</h1>
        <p className="text-sm text-muted-foreground">
          Alle laufenden Kundenabos auf einen Blick – Paket, Preis, Zahlweg,
          Laufzeit und Ansprechpartner. „Ändern“ führt direkt in die Abrechnung
          des Kunden.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="space-y-1 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div className={`text-2xl font-bold ${k.tone ?? ''}`}>{k.value}</div>
              {k.sub && <div className="text-xs text-muted-foreground">{k.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Mitgliedschaften angelegt. Sie entstehen automatisch, sobald
          du bei einem Kunden ein Paket in der Abrechnung konfigurierst.
        </p>
      ) : (
        <MembershipsTable rows={rows} todayIso={today} period={period} />
      )}

      {rows.length > 0 && <MembershipsProfitEstimate netMonthlyCents={mrrNet} />}
    </div>
  );
}
