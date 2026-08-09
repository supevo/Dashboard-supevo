import Link from 'next/link';
import { cookies } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { BRAND_COOKIE, resolveBrand } from '@/lib/brand';
import { BrandToggle } from '@/features/brand/components/brand-toggle';
import { getOrganization } from '@/features/organizations/queries';
import { OrganizationForm } from '@/features/organizations/components/organization-form';
import { buttonVariants } from '@/components/ui/button';
import { isAiEnabled, aiModelLabel } from '@/lib/ai/complete';
import { getOneDriveStatus } from '@/features/onedrive/queries';
import { OneDriveSettingsCard } from '@/features/onedrive/components/onedrive-settings-card';
import { ChoreAdmin } from '@/features/office-chores/components/chore-admin';
import { listOrgChores } from '@/features/office-chores/queries';
import { de } from '@/lib/i18n/de';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onedrive?: string; od_reason?: string; od_detail?: string }>;
}) {
  const { orgId } = await requireOrgAdminPage();
  // Independent → parallel. Org and OneDrive-Status don't depend on each other.
  const [org, oneDriveStatus, chores, sp, cookieStore] = await Promise.all([
    getOrganization(orgId),
    getOneDriveStatus(orgId),
    listOrgChores(orgId),
    searchParams,
    cookies(),
  ]);
  if (!org) return null;

  const aiOn = isAiEnabled();
  const aiLabel = aiModelLabel();
  const oneDriveParam = sp.onedrive;

  const brand = resolveBrand(cookieStore.get(BRAND_COOKIE)?.value);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.settings.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>🤖 KI-Status</CardTitle>
          <p className="text-sm text-muted-foreground">
            Betrifft alle KI-Funktionen (Zeiten-/Passwort-Import, Drucksachen-
            Erkennung, Briefing, Rückblick …).
          </p>
        </CardHeader>
        <CardContent>
          {aiOn ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                KI aktiv
              </span>
              {aiLabel && (
                <span className="text-muted-foreground">· {aiLabel}</span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
                <span className="font-medium text-muted-foreground">
                  KI inaktiv
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Kein API-Schlüssel gesetzt. KI-Funktionen nutzen dann nur die
                einfache Erkennung. Aktivieren per <code>OPENAI_API_KEY</code>,{' '}
                <code>GEMINI_API_KEY</code> oder <code>ANTHROPIC_API_KEY</code>{' '}
                (in Vercel). Details unter{' '}
                <Link href="/app/diagnostics" className="text-primary hover:underline">
                  Diagnose
                </Link>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="onedrive">
        <CardHeader>
          <CardTitle>☁️ OneDrive</CardTitle>
          <p className="text-sm text-muted-foreground">
            Persönliches OneDrive verbinden – Kundenordner in Aufgaben nutzen und
            hochgeladene Dateien automatisch in den Kundenordner spiegeln.
          </p>
        </CardHeader>
        <CardContent>
          <OneDriveSettingsCard
            status={oneDriveStatus}
            justConnected={oneDriveParam === 'connected'}
            errorReason={oneDriveParam === 'error' ? (sp.od_reason ?? 'unknown') : null}
            errorDetail={sp.od_detail ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🧹 Ordnungsdienst (Ausstempel-Checkliste)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Beim Ausstempeln bekommt jede:r einen zufällig &amp; fair zugeteilten
            Checkpunkt. Ein:e Kolleg:in prüft danach gegen – beide erhalten XP.
          </p>
        </CardHeader>
        <CardContent>
          <ChoreAdmin chores={chores} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🩺 System &amp; Diagnose</CardTitle>
          <p className="text-sm text-muted-foreground">
            Live-Prüfungen: Service-Schlüssel, KI-Status, Datenbank-Schema und
            OneDrive-Upload-Probleme.
          </p>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/diagnostics"
            className={buttonVariants({ variant: 'outline' })}
          >
            Diagnose öffnen
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🎨 Design</CardTitle>
          <p className="text-sm text-muted-foreground">
            Wechsle zwischen dem klassischen und dem Supevo-Look – sofort sichtbar.
          </p>
        </CardHeader>
        <CardContent>
          <BrandToggle current={brand} />
        </CardContent>
      </Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Firma &amp; Rechnung</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/finance?tab=rechnungen"
            className={buttonVariants({ variant: 'outline' })}
          >
            Rechnungseinstellungen
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
