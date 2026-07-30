import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listClientHub } from '@/features/assets/queries';
import { AssetHubManager } from '@/features/assets/components/asset-hub-manager';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';

export default async function ClientAccessPage() {
  await requireClientPage();
  const hub = await listClientHub();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔑 Zugänge</h1>
        <p className="text-sm text-muted-foreground">
          Hinterlegen Sie Login-Daten für Ihre Konten (z. B. Social Media,
          Website). Passwörter werden verschlüsselt gespeichert und sind nur für
          Ihr Agentur-Team sichtbar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ihre Zugänge</CardTitle>
        </CardHeader>
        <CardContent>
          {hub ? (
            <AssetHubManager
              clientCompanyId={hub.clientCompanyId}
              brands={hub.brands}
              assets={hub.assets}
              canReveal={false}
              secretVaultEnabled={isSecretVaultEnabled()}
              variant="access"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch keinem Unternehmen zugeordnet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
