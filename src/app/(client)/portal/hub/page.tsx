import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listClientAssets, type AssetView } from '@/features/assets/queries';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetList({ items }: { items: AssetView[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Noch nichts hinterlegt.</p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{a.title}</div>
            {a.hasFile && (
              <div className="text-xs text-muted-foreground">
                {a.fileName} · {formatSize(a.sizeBytes)}
              </div>
            )}
          </div>
          {a.hasFile ? (
            <a
              href={`/api/assets/${a.id}/download`}
              className="shrink-0 text-sm text-primary hover:underline"
            >
              Herunterladen
            </a>
          ) : (
            a.url && (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-sm text-primary hover:underline"
              >
                Öffnen
              </a>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function ClientHubPage() {
  await requireClientPage();
  const data = await listClientAssets();

  const logos = data?.assets.filter((a) => a.category === 'logo') ?? [];
  const guidelines = data?.assets.filter((a) => a.category === 'guideline') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🗂️ Marken-Hub</h1>
        <p className="text-sm text-muted-foreground">
          Ihre Marken-Guidelines und finalen Logos – jederzeit abrufbar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>🎨 Finale Logos</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetList items={logos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📘 Marken-Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetList items={guidelines} />
        </CardContent>
      </Card>
    </div>
  );
}
