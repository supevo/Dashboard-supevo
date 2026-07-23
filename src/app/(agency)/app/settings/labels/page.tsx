import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listLabels } from '@/features/labels/queries';
import { CreateLabelForm } from '@/features/labels/components/create-label-form';
import { LabelRow } from '@/features/labels/components/label-row';
import { de } from '@/lib/i18n/de';

export default async function LabelsPage() {
  const { orgId } = await requireOrgAdminPage();
  const labels = await listLabels(orgId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/settings" className="text-sm text-primary hover:underline">
          ← {de.settings.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{de.labels.title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.labels.create}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLabelForm orgId={orgId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.labels.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.labels.noLabels}</p>
          ) : (
            <div className="divide-y">
              {labels.map((l) => (
                <LabelRow key={l.id} orgId={orgId} label={l} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
