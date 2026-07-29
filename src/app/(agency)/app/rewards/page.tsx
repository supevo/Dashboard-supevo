import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getShopData, listLootItems, getLootConfig } from '@/features/loot/queries';
import { RewardPanel } from '@/features/loot/components/reward-panel';
import { LootAdmin } from '@/features/loot/components/loot-admin';

export const dynamic = 'force-dynamic';

export default async function RewardsPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const shop = await getShopData(user.id, orgId);

  const [items, config] = admin
    ? await Promise.all([listLootItems(orgId), getLootConfig(orgId)])
    : [[], shop.config];

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
            <CardTitle>⚙️ Lootboxen verwalten (Admin)</CardTitle>
          </CardHeader>
          <CardContent>
            <LootAdmin config={config} items={items} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
