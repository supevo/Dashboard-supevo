import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listIntegrationStatus } from '@/features/integrations/queries';
import { isGoogleConfigured } from '@/lib/integrations/google';
import { IntegrationRow } from '@/features/integrations/components/integration-row';

export const dynamic = 'force-dynamic';

/**
 * Integrationen (Super-Admin): externe Datenquellen je Kunde verbinden.
 * Start: Google Search Console (Rankings/Klicks). Weitere Quellen (GA4, Ads,
 * Meta) folgen demselben Muster.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/app');

  const sp = await searchParams;
  const rows = await listIntegrationStatus(orgId);
  const configured = isGoogleConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrationen</h1>
        <p className="text-sm text-muted-foreground">
          Externe Datenquellen je Kunde verbinden. Aktuell: Google Search
          Console (Rankings & Klicks der letzten 28 Tage).
        </p>
      </div>

      {sp.connected && <Alert>Verbindung hergestellt ✅</Alert>}
      {sp.error === 'norefresh' && (
        <Alert variant="destructive">
          Google hat keinen dauerhaften Zugriff (refresh_token) geliefert. Bitte
          erneut verbinden und die Zustimmung bestätigen.
        </Alert>
      )}
      {sp.error === 'nokey' && (
        <Alert variant="destructive">
          Kein Verschlüsselungsschlüssel gesetzt (SECRET_ENCRYPTION_KEY) – der
          Token wird aus Sicherheitsgründen nicht gespeichert.
        </Alert>
      )}
      {sp.error === '1' && (
        <Alert variant="destructive">Verbindung fehlgeschlagen oder abgebrochen.</Alert>
      )}

      {!configured && (
        <Alert variant="destructive">
          Die Google-Integration ist noch nicht konfiguriert. Es fehlen die
          Umgebungsvariablen <code>GOOGLE_CLIENT_ID</code> und{' '}
          <code>GOOGLE_CLIENT_SECRET</code> (plus ein gesetztes{' '}
          <code>SECRET_ENCRYPTION_KEY</code> und <code>NEXT_PUBLIC_APP_URL</code>).
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google Search Console</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pro Kunde einmal verbinden. Danach {'„Daten laden"'}, um die
            Top-Suchanfragen live abzurufen.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Kunden vorhanden.</p>
          ) : (
            rows.map((r) => (
              <IntegrationRow
                key={r.clientCompanyId}
                clientCompanyId={r.clientCompanyId}
                clientName={r.clientName}
                connected={r.connected}
                siteUrl={r.siteUrl}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
