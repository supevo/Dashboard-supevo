import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { getOrganization } from '@/features/organizations/queries';
import { OrganizationForm } from '@/features/organizations/components/organization-form';
import { buttonVariants } from '@/components/ui/button';
import { de } from '@/lib/i18n/de';

export default async function SettingsPage() {
  const { orgId } = await requireOrgAdminPage();
  const org = await getOrganization(orgId);
  if (!org) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.settings.title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationForm orgId={org.id} name={org.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.labels.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/settings/labels"
            className={buttonVariants({ variant: 'outline' })}
          >
            {de.labels.manage}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
