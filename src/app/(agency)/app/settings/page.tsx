import Link from 'next/link';
import { cookies } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { BRAND_COOKIE, resolveBrand } from '@/lib/brand';
import { BrandToggle } from '@/features/brand/components/brand-toggle';
import { getOrganization } from '@/features/organizations/queries';
import { OrganizationForm } from '@/features/organizations/components/organization-form';
import { BannerAdmin } from '@/features/gamification/components/banner-admin';
import { listHubBanners } from '@/features/gamification/banner-queries';
import { FrameAdmin } from '@/features/gamification/components/frame-admin';
import { listHubFrames } from '@/features/gamification/frame-queries';
import { StickerManager } from '@/features/messenger/components/sticker-manager';
import { listStickers } from '@/features/messenger/queries';
import { buttonVariants } from '@/components/ui/button';
import { isAiEnabled, aiModelLabel } from '@/lib/ai/complete';
import { de } from '@/lib/i18n/de';

export default async function SettingsPage() {
  const { orgId } = await requireOrgAdminPage();
  const org = await getOrganization(orgId);
  if (!org) return null;

  const aiOn = isAiEnabled();
  const aiLabel = aiModelLabel();

  const [hubBanners, hubFrames, stickers] = await Promise.all([
    listHubBanners(orgId),
    listHubFrames(orgId),
    listStickers(orgId),
  ]);
  const brand = resolveBrand((await cookies()).get(BRAND_COOKIE)?.value);

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
          <CardTitle>{de.hubBanners.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <BannerAdmin banners={hubBanners} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🖼️ Profilrahmen</CardTitle>
        </CardHeader>
        <CardContent>
          <FrameAdmin frames={hubFrames} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🖼️ Chat-Sticker</CardTitle>
        </CardHeader>
        <CardContent>
          <StickerManager stickers={stickers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firma &amp; Rechnung</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/settings/billing"
            className={buttonVariants({ variant: 'outline' })}
          >
            Rechnungseinstellungen
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
