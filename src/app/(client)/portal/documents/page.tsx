import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getClientDocuments, type DocLink } from '@/features/documents/queries';

export const dynamic = 'force-dynamic';

function DocList({ items, empty }: { items: DocLink[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{d.label}</div>
            {d.meta && <div className="text-xs text-muted-foreground">{d.meta}</div>}
          </div>
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ⬇ Download
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function PortalDocumentsPage() {
  await requireClientPage();
  const docs = await getClientDocuments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dokumente &amp; Marken</h1>
        <p className="text-sm text-muted-foreground">
          Alle wichtigen Unterlagen an einem Ort – zum Ansehen und Herunterladen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>📄 Verträge &amp; Mandate</CardTitle>
        </CardHeader>
        <CardContent>
          <DocList items={docs.contracts} empty="Noch keine Verträge hinterlegt." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🧾 Rechnungen</CardTitle>
        </CardHeader>
        <CardContent>
          <DocList items={docs.invoices} empty="Es liegen noch keine Rechnungen vor." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🎨 Marken &amp; Dateien</CardTitle>
        </CardHeader>
        <CardContent>
          <DocList items={docs.assets} empty="Noch keine Dateien hinterlegt." />
        </CardContent>
      </Card>
    </div>
  );
}
