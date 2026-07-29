import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  type BoxTier,
  lootItemImageUrl,
  inventoryImageUrl,
  boxArtUrl,
  boxVideoUrl,
} from '@/features/loot/shared';
import { customBannerImageUrl } from '@/features/gamification/banners';

export type { BoxTier } from '@/features/loot/shared';
export { WEIGHT_MIN, WEIGHT_MAX, lootItemImageUrl, inventoryImageUrl, boxArtUrl, boxVideoUrl } from '@/features/loot/shared';

export interface LootConfig {
  xpPerCoin: number;
  priceCommon: number;
  priceRare: number;
  priceSuper: number;
  /** Whether custom box artwork was uploaded per tier. */
  hasArt?: { common: boolean; rare: boolean; super: boolean };
  /** Whether an opening video was uploaded per tier. */
  hasVideo?: { common: boolean; rare: boolean; super: boolean };
}

export const DEFAULT_LOOT_CONFIG: LootConfig = {
  xpPerCoin: 10,
  priceCommon: 20,
  priceRare: 50,
  priceSuper: 120,
  hasArt: { common: false, rare: false, super: false },
  hasVideo: { common: false, rare: false, super: false },
};

export interface LootItem {
  id: string;
  boxTier: BoxTier;
  name: string;
  description: string | null;
  type: 'physical' | 'badge' | 'banner';
  weight: number;
  badgeEmoji: string | null;
  badgeName: string | null;
  imageUrl: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  type: 'physical' | 'badge';
  badgeEmoji: string | null;
  badgeName: string | null;
  boxTier: string | null;
  imageUrl: string | null;
  status: 'new' | 'requested' | 'fulfilled';
  wonAt: string;
}

export interface BoxInfo {
  tier: BoxTier;
  price: number;
  itemCount: number;
  artUrl: string | null;
  videoUrl: string | null;
  free: number;
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
    .select(
      'xp_per_coin, price_common, price_rare, price_super, image_common, image_rare, image_super, video_common, video_rare, video_super',
    )
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_LOOT_CONFIG };
  return {
    xpPerCoin: data.xp_per_coin,
    priceCommon: data.price_common,
    priceRare: data.price_rare,
    priceSuper: data.price_super,
    hasArt: {
      common: Boolean(data.image_common),
      rare: Boolean(data.image_rare),
      super: Boolean(data.image_super),
    },
    hasVideo: {
      common: Boolean(data.video_common),
      rare: Boolean(data.video_rare),
      super: Boolean(data.video_super),
    },
  };
}

/** Everything the reward page needs for a staff member. */
export async function getShopData(userId: string, orgId: string): Promise<ShopData> {
  const service = createSupabaseServiceClient();
  const [config, walletRes, itemsRes, invRes, grantsRes, points] = await Promise.all([
    getLootConfig(orgId),
    service.from('loot_wallets').select('coins_spent').eq('user_id', userId).maybeSingle(),
    service.from('loot_items').select('box_tier').eq('organization_id', orgId),
    service
      .from('loot_inventory')
      .select('id, name, description, type, badge_emoji, badge_name, box_tier, image_path, banner_image_id, status, won_at')
      .eq('user_id', userId)
      .order('won_at', { ascending: false })
      .limit(100),
    service
      .from('loot_grants')
      .select('box_tier')
      .eq('user_id', userId)
      .is('opened_at', null),
    totalPoints(service, userId),
  ]);

  const spent = walletRes.data?.coins_spent ?? 0;
  const earned = Math.floor(points / Math.max(1, config.xpPerCoin));
  const counts = { common: 0, rare: 0, super: 0 } as Record<BoxTier, number>;
  for (const it of itemsRes.data ?? []) {
    if (it.box_tier in counts) counts[it.box_tier as BoxTier] += 1;
  }
  const free = { common: 0, rare: 0, super: 0 } as Record<BoxTier, number>;
  for (const g of grantsRes.data ?? []) {
    if (g.box_tier in free) free[g.box_tier as BoxTier] += 1;
  }
  const art = config.hasArt ?? { common: false, rare: false, super: false };
  const vid = config.hasVideo ?? { common: false, rare: false, super: false };

  return {
    balance: Math.max(0, earned - spent),
    earned,
    spent,
    config,
    boxes: [
      { tier: 'common', price: config.priceCommon, itemCount: counts.common, artUrl: art.common ? boxArtUrl('common') : null, videoUrl: vid.common ? boxVideoUrl('common') : null, free: free.common },
      { tier: 'rare', price: config.priceRare, itemCount: counts.rare, artUrl: art.rare ? boxArtUrl('rare') : null, videoUrl: vid.rare ? boxVideoUrl('rare') : null, free: free.rare },
      { tier: 'super', price: config.priceSuper, itemCount: counts.super, artUrl: art.super ? boxArtUrl('super') : null, videoUrl: vid.super ? boxVideoUrl('super') : null, free: free.super },
    ],
    inventory: (invRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type as 'physical' | 'badge',
      badgeEmoji: r.badge_emoji,
      badgeName: r.badge_name,
      boxTier: r.box_tier,
      imageUrl: r.banner_image_id
        ? customBannerImageUrl(r.banner_image_id)
        : r.image_path
          ? inventoryImageUrl(r.id)
          : null,
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

/** A physical reward a staff member has redeemed – for the admin overview. */
export interface Redemption {
  id: string;
  userName: string;
  itemName: string;
  boxTier: string | null;
  imageUrl: string | null;
  status: 'requested' | 'fulfilled';
  redeemedAt: string | null;
}

/**
 * All physical redemptions of the org (requested + fulfilled), newest first,
 * with the redeeming staff member's name. Powers the admin "who redeemed what"
 * list. Badges are auto-granted and therefore excluded.
 */
export async function listRedemptions(orgId: string): Promise<Redemption[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('loot_inventory')
    .select('id, user_id, name, box_tier, image_path, status, redeemed_at')
    .eq('organization_id', orgId)
    .eq('type', 'physical')
    .in('status', ['requested', 'fulfilled'])
    .order('redeemed_at', { ascending: false });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await service.from('profiles').select('id, full_name').in('id', ids);
    for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? '—');
  }
  return rows.map((r) => ({
    id: r.id,
    userName: nameById.get(r.user_id) ?? '—',
    itemName: r.name,
    boxTier: r.box_tier,
    imageUrl: r.image_path ? inventoryImageUrl(r.id) : null,
    status: r.status as 'requested' | 'fulfilled',
    redeemedAt: r.redeemed_at,
  }));
}

/** All loot items of the org for the admin editor. */
export async function listLootItems(orgId: string): Promise<LootItem[]> {
  const { data } = await createSupabaseServiceClient()
    .from('loot_items')
    .select('id, box_tier, name, description, type, weight, badge_emoji, badge_name, image_path, banner_image_id')
    .eq('organization_id', orgId)
    .order('box_tier', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    boxTier: r.box_tier as BoxTier,
    name: r.name,
    description: r.description,
    type: r.type as 'physical' | 'badge' | 'banner',
    weight: r.weight,
    badgeEmoji: r.badge_emoji,
    badgeName: r.badge_name,
    imageUrl: r.banner_image_id
      ? customBannerImageUrl(r.banner_image_id)
      : r.image_path
        ? lootItemImageUrl(r.id)
        : null,
  }));
}
