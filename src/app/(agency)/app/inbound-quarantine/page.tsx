import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listQuarantine } from '@/features/inquiries/quarantine-queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { QuarantineList } from '@/features/inquiries/components/quarantine-list';

export const dynamic = 'force-dynamic';

/**
 * Quarantäne für E-Mail-Anfragen (Super-Admin): Mails, die nicht eindeutig
 * einem Kunden zugeordnet werden konnten (unbekannte/deaktivierte Adresse oder
 * mehrere Kunden in einer Mail). Hier manuell zuordnen oder verwerfen – so geht
 * nichts verloren, es wird aber nie geraten.
 */
export default async function InboundQuarantinePage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const [items, companies] = await Promise.all([
    listQuarantine(),
    listClientCompanies(orgId),
  ]);
  const clients = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Anfragen-Quarantäne</h1>
        <p className="text-sm text-muted-foreground">
          E-Mails, die nicht eindeutig zugeordnet werden konnten. Ordne sie einem
          Kunden zu oder verwirf sie – die Zuordnung wird nie automatisch geraten.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Offen ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <QuarantineList items={items} clients={clients} />
        </CardContent>
      </Card>
    </div>
  );
}
