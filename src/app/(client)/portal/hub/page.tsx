import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listClientHub } from '@/features/assets/queries';
import { AssetHubManager } from '@/features/assets/components/asset-hub-manager';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';

export default async function ClientHubPage() {
  await requireClientPage();
  const hub = await listClientHub();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🗂️ Brand</h1>
        <p className="text-sm text-muted-foreground">
          Ihre Marken, finalen Logos und Marken-Guidelines – zentral abgelegt und
          jederzeit abrufbar. Legen Sie auch Submarken an und laden Sie eigene
          Dateien hoch.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marken &amp; Assets</CardTitle>
        </CardHeader>
        <CardContent>
          {hub ? (
            <AssetHubManager
              clientCompanyId={hub.clientCompanyId}
              brands={hub.brands}
              assets={hub.assets}
              canReveal={false}
              secretVaultEnabled={isSecretVaultEnabled()}
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
