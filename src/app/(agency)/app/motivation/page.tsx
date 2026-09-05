import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { isOrgAdmin, isSuperAdmin } from '@/lib/authz/policies';
import { ResetGamificationPanel } from '@/features/gamification/components/reset-gamification-panel';
import { getCurrentUser } from '@/features/auth/session';
import { listOrgChallenges } from '@/features/gamification/custom-challenges';
import { METRIC_OPTIONS } from '@/features/gamification/challenge-metrics';
import { listXpBoosts } from '@/features/gamification/xp-boost';
import { ChallengeAdmin } from '@/features/gamification/components/challenge-admin';
import { XpBoostAdmin } from '@/features/gamification/components/xp-boost-admin';
import { listLootItems, getLootConfig, listRedemptions } from '@/features/loot/queries';
import { listColleagues } from '@/features/team/colleague';
import { LootAdmin } from '@/features/loot/components/loot-admin';
import { RedemptionsAdmin } from '@/features/loot/components/redemptions-admin';
import { AwardsOverview } from '@/features/awards/components/awards-overview';
import { listHubBanners } from '@/features/gamification/banner-queries';
import { BannerAdmin } from '@/features/gamification/components/banner-admin';
import { listHubFrames } from '@/features/gamification/frame-queries';
import { FrameAdmin } from '@/features/gamification/components/frame-admin';
import { getLeagueSymbols } from '@/features/gamification/league-symbols';
import { LeagueSymbolsForm } from '@/features/gamification/components/league-symbols-form';
import { listStickers } from '@/features/messenger/queries';
import { StickerManager } from '@/features/messenger/components/sticker-manager';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

/**
 * Motivation-Hub – the single admin home for gamification, merging the former
 * Challenges, Belohnungen, Auszeichnungen and Liga-Symbole pages into one
 * tabbed module: Challenges & XP · Belohnungen · Auszeichnungen · Kosmetik.
 * Admin-only. The employee-facing shop lives in the Level Hub.
 */
export default async function MotivationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const { orgId } = await requireOrgAdminPage();
  const user = await getCurrentUser();
  const sp = await searchParams;
  const activeTab = sp.tab ?? 'challenges';

  const [
    challenges,
    boosts,
    items,
    config,
    roster,
    redemptions,
    hubBanners,
    hubFrames,
    leagueSymbols,
    stickers,
  ] = await Promise.all([
    listOrgChallenges(orgId),
    listXpBoosts(orgId),
    listLootItems(orgId),
    getLootConfig(orgId),
    listColleagues(orgId),
    listRedemptions(orgId),
    listHubBanners(orgId),
    listHubFrames(orgId),
    getLeagueSymbols(orgId),
    listStickers(orgId),
  ]);

  const colleagues = roster.map((c) => ({ userId: c.userId, name: c.name }));
  // Nur exklusive Titelbilder/Rahmen können Lootbox-Items werden.
  const exclusiveBanners = hubBanners
    .filter((b) => b.exclusive)
    .map((b) => ({ id: b.id, name: b.name, imageUrl: b.imageUrl }));
  const exclusiveFrames = hubFrames
    .filter((f) => f.exclusive)
    .map((f) => ({ id: f.id, name: f.name, imageUrl: f.imageUrl }));

  const tabs: TabDef[] = [
    {
      key: 'challenges',
      label: 'Challenges & XP',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Challenges verwalten</CardTitle>
              <p className="text-sm text-muted-foreground">
                Lege eigene Challenges an, plane sie je Woche vor und vergib eigene
                Badges. Bei Zielerreichung bekommt der/die Mitarbeiter:in automatisch
                XP + Badge.
              </p>
            </CardHeader>
            <CardContent>
              <ChallengeAdmin challenges={challenges} metricOptions={METRIC_OPTIONS} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>⚡ Double-XP-Woche</CardTitle>
            </CardHeader>
            <CardContent>
              <XpBoostAdmin boosts={boosts} />
            </CardContent>
          </Card>
        </>
      ),
    },
    {
      key: 'belohnungen',
      label: 'Belohnungen',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>📥 Einlösungen (wer hat was eingelöst)</CardTitle>
            </CardHeader>
            <CardContent>
              <RedemptionsAdmin redemptions={redemptions} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>⚙️ Lootboxen verwalten</CardTitle>
              <p className="text-sm text-muted-foreground">
                Der Shop, in dem Mitarbeiter Coins ausgeben und Lootboxen öffnen,
                liegt im Level Hub.
              </p>
            </CardHeader>
            <CardContent>
              <LootAdmin
                config={config}
                items={items}
                colleagues={colleagues}
                banners={exclusiveBanners}
                frames={exclusiveFrames}
              />
            </CardContent>
          </Card>
          {user && isSuperAdmin(user) && (
            <Card>
              <CardHeader>
                <CardTitle>♻️ XP, Ränge &amp; Coins zurücksetzen</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Setzt XP/Level und Coins zurück (alle oder eine Person). Badges,
                  Titelbilder und Inventar bleiben erhalten. Nur Super-Admin.
                </p>
              </CardHeader>
              <CardContent>
                <ResetGamificationPanel orgId={orgId} colleagues={colleagues} />
              </CardContent>
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'auszeichnungen',
      label: 'Auszeichnungen',
      content: user ? (
        <AwardsOverview
          orgId={orgId}
          viewerId={user.id}
          viewerName={user.fullName ?? user.email}
          isAdmin={isOrgAdmin(user, orgId)}
          monthParam={sp.month}
          monthHrefPrefix="/app/motivation?tab=auszeichnungen&month="
        />
      ) : null,
    },
    {
      key: 'kosmetik',
      label: 'Kosmetik',
      content: (
        <>
          <Card>
            <CardHeader>
              <CardTitle>🏆 Liga-Symbole</CardTitle>
              <p className="text-sm text-muted-foreground">
                Eigene Symbole für die Ligen (Level Hub, Kollegen, Profile).
              </p>
            </CardHeader>
            <CardContent>
              <LeagueSymbolsForm symbols={leagueSymbols} />
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
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Motivation</h1>
        <p className="text-sm text-muted-foreground">
          Challenges, Belohnungen, Auszeichnungen und Kosmetik – zentral verwaltet.
        </p>
      </div>
      <Tabs tabs={tabs} initialKey={activeTab} />
    </div>
  );
}
