import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getShopData, listLootItems, getLootConfig, listRedemptions } from '@/features/loot/queries';
import { listHubBanners } from '@/features/gamification/banner-queries';
import { listColleagues } from '@/features/team/colleague';
import { RewardPanel } from '@/features/loot/components/reward-panel';
import { LootAdmin } from '@/features/loot/components/loot-admin';
import { RedemptionsAdmin } from '@/features/loot/components/redemptions-admin';

export const dynamic = 'force-dynamic';

export default async function RewardsPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const shop = await getShopData(user.id, orgId);

  const [items, config, roster, redemptions, hubBanners] = admin
    ? await Promise.all([
        listLootItems(orgId),
        getLootConfig(orgId),
        listColleagues(orgId),
        listRedemptions(orgId),
        listHubBanners(orgId),
      ])
    : [[], shop.config, [], [], []];
  const colleagues = roster.map((c) => ({ userId: c.userId, name: c.name }));
  // Nur exklusive Titelbilder können Lootbox-Items werden.
  const exclusiveBanners = hubBanners
    .filter((b) => b.exclusive)
    .map((b) => ({ id: b.id, name: b.name, imageUrl: b.imageUrl }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Belohnungen</h1>
        <p className="text-sm text-muted-foreground">
          Sammle Coins mit deinen XP, öffne Lootboxen und löse gewonnene Items ein.
        </p>
      </div>

      <RewardPanel shop={shop} />

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>📥 Einlösungen (wer hat was eingelöst)</CardTitle>
          </CardHeader>
          <CardContent>
            <RedemptionsAdmin redemptions={redemptions} />
          </CardContent>
        </Card>
      )}

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>⚙️ Lootboxen verwalten (Admin)</CardTitle>
          </CardHeader>
          <CardContent>
            <LootAdmin config={config} items={items} colleagues={colleagues} banners={exclusiveBanners} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
