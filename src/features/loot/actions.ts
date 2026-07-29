'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { getLootConfig } from '@/features/loot/queries';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';

const tierSchema = z.enum(['common', 'rare', 'super']);

function priceFor(config: Awaited<ReturnType<typeof getLootConfig>>, tier: string): number {
  if (tier === 'common') return config.priceCommon;
  if (tier === 'rare') return config.priceRare;
  return config.priceSuper;
}

async function coinBalance(
  service: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  xpPerCoin: number,
): Promise<number> {
  const [kudosRes, xpRes, walletRes] = await Promise.all([
    service.from('kudos').select('points').eq('to_user_id', userId),
    service.from('xp_events').select('points').eq('user_id', userId),
    service.from('loot_wallets').select('coins_spent').eq('user_id', userId).maybeSingle(),
  ]);
  const total =
    (kudosRes.data ?? []).reduce((n, r) => n + (r.points ?? 0), 0) +
    (xpRes.data ?? []).reduce((n, r) => n + (r.points ?? 0), 0);
  const earned = Math.floor(total / Math.max(1, xpPerCoin));
  return Math.max(0, earned - (walletRes.data?.coins_spent ?? 0));
}

/**
 * Opens a lootbox, draws an item by weight and adds it to the inventory.
 * A gifted free box (loot_grants) is consumed first and costs no coins;
 * otherwise the box price in coins is spent.
 */
export async function openBoxAction(
  tier: string,
  opts?: { free?: boolean },
): Promise<ActionResult> {
  const parsed = tierSchema.safeParse(tier);
  if (!parsed.success) return errorResult('Ungültige Box.');

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult('Keine Berechtigung.');
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult('Keine Organisation.');

  const service = createSupabaseServiceClient();
  const config = await getLootConfig(orgId);
  const price = priceFor(config, parsed.data);

  // Prefer a gifted free box when requested (or when one is available).
  let freeGrantId: string | null = null;
  if (opts?.free) {
    const { data: grant } = await service
      .from('loot_grants')
      .select('id')
      .eq('user_id', user.id)
      .eq('box_tier', parsed.data)
      .is('opened_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!grant) return errorResult('Keine Gratis-Box dieser Stufe vorhanden.');
    freeGrantId = grant.id;
  } else {
    const balance = await coinBalance(service, user.id, config.xpPerCoin);
    if (balance < price) return errorResult('Nicht genug Coins für diese Box.');
  }

  const { data: items } = await service
    .from('loot_items')
    .select('name, description, type, weight, badge_emoji, badge_name, image_path')
    .eq('organization_id', orgId)
    .eq('box_tier', parsed.data);
  if (!items || items.length === 0) return errorResult('Diese Box ist noch leer.');

  // Weighted random draw.
  const totalWeight = items.reduce((n, it) => n + Math.max(1, it.weight), 0);
  let roll = Math.random() * totalWeight;
  let drawn = items[0]!;
  for (const it of items) {
    roll -= Math.max(1, it.weight);
    if (roll <= 0) {
      drawn = it;
      break;
    }
  }

  if (freeGrantId) {
    await service
      .from('loot_grants')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', freeGrantId)
      .is('opened_at', null);
  } else {
    // Spend coins (best-effort; small teams don't race).
    const { data: wallet } = await service
      .from('loot_wallets')
      .select('coins_spent')
      .eq('user_id', user.id)
      .maybeSingle();
    await service.from('loot_wallets').upsert({
      user_id: user.id,
      organization_id: orgId,
      coins_spent: (wallet?.coins_spent ?? 0) + price,
      updated_at: new Date().toISOString(),
    });
  }

  const { data: inserted } = await service
    .from('loot_inventory')
    .insert({
      organization_id: orgId,
      user_id: user.id,
      name: drawn.name,
      description: drawn.description,
      type: drawn.type,
      badge_emoji: drawn.badge_emoji,
      badge_name: drawn.badge_name,
      box_tier: parsed.data,
      image_path: drawn.image_path,
      status: 'new',
    })
    .select('id')
    .maybeSingle();

  revalidatePath('/app/rewards');
  revalidatePath('/app/kudos');
  return successResult('Box geöffnet!', {
    name: drawn.name,
    type: drawn.type,
    badgeEmoji: drawn.badge_emoji ?? '🎁',
    imageUrl: drawn.image_path && inserted?.id ? `/api/loot/inventory/${inserted.id}/image` : null,
    tier: parsed.data,
  });
}

/** Redeems an inventory item: badge → granted directly; physical → notifies admins. */
export async function redeemItemAction(inventoryId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(inventoryId).success) return errorResult('Ungültig.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();

  const { data: item } = await service
    .from('loot_inventory')
    .select('id, organization_id, name, type, status')
    .eq('id', inventoryId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!item) return errorResult('Nicht gefunden.');
  if (item.status !== 'new') return errorResult('Bereits eingelöst.');

  if (item.type === 'badge') {
    await service
      .from('achievements')
      .upsert(
        { user_id: user.id, organization_id: item.organization_id, key: `loot_${item.id}` },
        { onConflict: 'user_id,key', ignoreDuplicates: true },
      );
    await service
      .from('loot_inventory')
      .update({ status: 'fulfilled', redeemed_at: new Date().toISOString() })
      .eq('id', item.id);
    revalidatePath('/app/rewards');
    return successResult('Badge deinem Profil gutgeschrieben.');
  }

  // Physical reward → request fulfilment + notify admins.
  await service
    .from('loot_inventory')
    .update({ status: 'requested', redeemed_at: new Date().toISOString() })
    .eq('id', item.id);

  const { data: admins } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', item.organization_id)
    .eq('status', 'active');
  const recipients = (admins ?? [])
    .filter((m) => m.role === 'agency_admin' || m.role === 'super_admin')
    .map((m) => m.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: item.organization_id,
        recipientId,
        type: 'award' as const,
        title: 'Belohnung einzulösen',
        body: `${user.fullName ?? user.email} möchte einlösen: ${item.name}`,
        entityType: 'loot',
        entityId: item.id,
      })),
      user.id,
    );
  }

  revalidatePath('/app/rewards');
  return successResult('Anfrage gesendet – wir melden uns zum Einlösen.');
}

// --- Admin config -----------------------------------------------------------

async function requireAdminOrg(): Promise<string | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  return orgId && isOrgAdmin(user, orgId) ? orgId : null;
}

const configSchema = z.object({
  xpPerCoin: z.coerce.number().int().min(1).max(1000),
  priceCommon: z.coerce.number().int().min(0).max(1000000),
  priceRare: z.coerce.number().int().min(0).max(1000000),
  priceSuper: z.coerce.number().int().min(0).max(1000000),
});

export async function saveLootConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const { error } = await createSupabaseServiceClient().from('loot_config').upsert({
    organization_id: orgId,
    xp_per_coin: parsed.data.xpPerCoin,
    price_common: parsed.data.priceCommon,
    price_rare: parsed.data.priceRare,
    price_super: parsed.data.priceSuper,
    updated_at: new Date().toISOString(),
  });
  if (error) return errorResult(error.message);
  revalidatePath('/app/rewards');
  return successResult('Einstellungen gespeichert.');
}

export async function deleteLootItemAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult('Ungültig.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const { error } = await createSupabaseServiceClient()
    .from('loot_items')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);
  if (error) return errorResult(error.message);
  revalidatePath('/app/rewards');
  return successResult('Gelöscht.');
}

/**
 * Admin marks a redeemed physical reward as handed over (`requested` →
 * `fulfilled`). Idempotent and scoped to the admin's own organization.
 */
export async function markRedemptionFulfilledAction(inventoryId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(inventoryId).success) return errorResult('Ungültig.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();

  const { data: item } = await service
    .from('loot_inventory')
    .select('id, status')
    .eq('id', inventoryId)
    .eq('organization_id', orgId)
    .eq('type', 'physical')
    .maybeSingle();
  if (!item) return errorResult('Nicht gefunden.');
  if (item.status === 'fulfilled') return successResult('Bereits erledigt.');

  const { error } = await service
    .from('loot_inventory')
    .update({ status: 'fulfilled' })
    .eq('id', inventoryId)
    .eq('organization_id', orgId);
  if (error) return errorResult(error.message);

  revalidatePath('/app/rewards');
  return successResult('Als erledigt markiert.');
}

// --- Gifting free boxes ------------------------------------------------------

const giftSchema = z.object({
  userId: z.string().uuid(),
  boxTier: z.enum(['common', 'rare', 'super']),
  quantity: z.coerce.number().int().min(1).max(20),
  note: z.string().trim().max(140).optional().or(z.literal('')),
});

/**
 * Gifts one or more free lootboxes to a staff member (e.g. for testing or a
 * special challenge week). The recipient opens them for free in their Level Hub.
 */
export async function giftBoxAction(input: unknown): Promise<ActionResult> {
  const parsed = giftSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte Mitarbeiter, Box und Anzahl wählen.');
  const admin = await requireUser();
  const orgId = primaryAgencyOrgId(admin);
  if (!orgId || !isOrgAdmin(admin, orgId)) return errorResult('Keine Berechtigung.');

  const v = parsed.data;
  const service = createSupabaseServiceClient();

  // Recipient must be active staff in this org.
  const { data: membership } = await service
    .from('memberships')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', v.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership || membership.role === 'client') {
    return errorResult('Mitarbeiter nicht gefunden.');
  }

  const rows = Array.from({ length: v.quantity }, () => ({
    organization_id: orgId,
    user_id: v.userId,
    box_tier: v.boxTier,
    note: v.note || null,
    created_by: admin.id,
  }));
  const { error } = await service.from('loot_grants').insert(rows);
  if (error) return errorResult(error.message);

  const tierLabel = v.boxTier === 'common' ? 'Common' : v.boxTier === 'rare' ? 'Rare' : 'Super Rare';
  await createNotifications(
    [
      {
        organizationId: orgId,
        recipientId: v.userId,
        type: 'award' as const,
        title: '🎁 Gratis-Box geschenkt',
        body:
          v.quantity > 1
            ? `Du hast ${v.quantity} ${tierLabel}-Boxen geschenkt bekommen – im Level Hub gratis öffnen!`
            : `Du hast eine ${tierLabel}-Box geschenkt bekommen – im Level Hub gratis öffnen!`,
        entityType: 'loot',
        entityId: null,
      },
    ],
    admin.id,
  );

  revalidatePath('/app/rewards');
  revalidatePath('/app/kudos');
  return successResult(
    v.quantity > 1 ? `${v.quantity} Boxen verschenkt.` : 'Box verschenkt.',
  );
}
