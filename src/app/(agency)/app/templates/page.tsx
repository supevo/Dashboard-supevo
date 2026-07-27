import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listProjectTemplates } from '@/features/templates/queries';
import { TemplatesManager } from '@/features/templates/components/templates-manager';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  await requireOrgAdminPage();
  const templates = await listProjectTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.templates.title}</h1>
        <p className="text-sm text-muted-foreground">{de.templates.subtitle}</p>
      </div>
      <TemplatesManager templates={templates} />
    </div>
  );
}
