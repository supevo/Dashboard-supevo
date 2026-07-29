import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface LootConfig {
  xpPerCoin: number;
  priceCommon: number;
  priceRare: number;
  priceSuper: number;
}

export const DEFAULT_LOOT_CONFIG: LootConfig = {
  xpPerCoin: 10,
  priceCommon: 20,
  priceRare: 50,
  priceSuper: 120,
};

export type BoxTier = 'common' | 'rare' | 'super';

export interface LootItem {
  id: string;
  boxTier: BoxTier;
  name: string;
  description: string | null;
  type: 'physical' | 'badge';
  weight: number;
  badgeEmoji: string | null;
  badgeName: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  type: 'physical' | 'badge';
  badgeEmoji: string | null;
  badgeName: string | null;
  boxTier: string | null;
  status: 'new' | 'requested' | 'fulfilled';
  wonAt: string;
}

export interface BoxInfo {
  tier: BoxTier;
  price: number;
  itemCount: number;
}

export interface ShopData {
  balance: number;
  earned: number;
  spent: number;
  config: LootConfig;
  boxes: BoxInfo[];
  inventory: InventoryItem[];
}

/** Total lifetime points (kudos received + automatic XP) → basis for coins. */
async function totalPoints(
  service: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
): Promise<number> {
  const [kudosRes, xpRes] = await Promise.all([
    service.from('kudos').select('points').eq('to_user_id', userId),
    service.from('xp_events').select('points').eq('user_id', userId),
  ]);
  const k = (kudosRes.data ?? []).reduce((n, r) => n + (r.points ?? 0), 0);
  const x = (xpRes.data ?? []).reduce((n, r) => n + (r.points ?? 0), 0);
  return k + x;
}

export async function getLootConfig(orgId: string): Promise<LootConfig> {
  const { data } = await createSupabaseServiceClient()
    .from('loot_config')
    .select('xp_per_coin, price_common, price_rare, price_super')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return DEFAULT_LOOT_CONFIG;
  return {
    xpPerCoin: data.xp_per_coin,
    priceCommon: data.price_common,
    priceRare: data.price_rare,
    priceSuper: data.price_super,
  };
}

/** Everything the reward page needs for a staff member. */
export async function getShopData(userId: string, orgId: string): Promise<ShopData> {
  const service = createSupabaseServiceClient();
  const [config, walletRes, itemsRes, invRes, points] = await Promise.all([
    getLootConfig(orgId),
    service.from('loot_wallets').select('coins_spent').eq('user_id', userId).maybeSingle(),
    service.from('loot_items').select('box_tier').eq('organization_id', orgId),
    service
      .from('loot_inventory')
      .select('id, name, description, type, badge_emoji, badge_name, box_tier, status, won_at')
      .eq('user_id', userId)
      .order('won_at', { ascending: false })
      .limit(100),
    totalPoints(service, userId),
  ]);

  const spent = walletRes.data?.coins_spent ?? 0;
  const earned = Math.floor(points / Math.max(1, config.xpPerCoin));
  const counts = { common: 0, rare: 0, super: 0 } as Record<BoxTier, number>;
  for (const it of itemsRes.data ?? []) {
    if (it.box_tier in counts) counts[it.box_tier as BoxTier] += 1;
  }

  return {
    balance: Math.max(0, earned - spent),
    earned,
    spent,
    config,
    boxes: [
      { tier: 'common', price: config.priceCommon, itemCount: counts.common },
      { tier: 'rare', price: config.priceRare, itemCount: counts.rare },
      { tier: 'super', price: config.priceSuper, itemCount: counts.super },
    ],
    inventory: (invRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type as 'physical' | 'badge',
      badgeEmoji: r.badge_emoji,
      badgeName: r.badge_name,
      boxTier: r.box_tier,
      status: r.status as 'new' | 'requested' | 'fulfilled',
      wonAt: r.won_at,
    })),
  };
}

/** Just the spendable coin balance – light query for the header chip. */
export async function getCoinBalance(userId: string, orgId: string): Promise<number> {
  const service = createSupabaseServiceClient();
  const [config, walletRes, points] = await Promise.all([
    getLootConfig(orgId),
    service.from('loot_wallets').select('coins_spent').eq('user_id', userId).maybeSingle(),
    totalPoints(service, userId),
  ]);
  const spent = walletRes.data?.coins_spent ?? 0;
  const earned = Math.floor(points / Math.max(1, config.xpPerCoin));
  return Math.max(0, earned - spent);
}

/** All loot items of the org for the admin editor. */
export async function listLootItems(orgId: string): Promise<LootItem[]> {
  const { data } = await createSupabaseServiceClient()
    .from('loot_items')
    .select('id, box_tier, name, description, type, weight, badge_emoji, badge_name')
    .eq('organization_id', orgId)
    .order('box_tier', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    boxTier: r.box_tier as BoxTier,
    name: r.name,
    description: r.description,
    type: r.type as 'physical' | 'badge',
    weight: r.weight,
    badgeEmoji: r.badge_emoji,
    badgeName: r.badge_name,
  }));
}
