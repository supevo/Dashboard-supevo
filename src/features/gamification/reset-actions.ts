'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  orgId: z.string().uuid(),
  // 'all' = alle Mitarbeiter der Org, sonst eine konkrete userId.
  scope: z.union([z.literal('all'), z.string().uuid()]),
  // Kollegen-Kudos (erhaltene Punkte) mit zurücksetzen. Für einen echten
  // Rang-Reset nötig, da Kudos-Punkte in Level/Rang & Coins einfließen.
  includeKudos: z.boolean().default(true),
  confirm: z.string(),
});

const CONFIRM_WORD = 'ZURÜCKSETZEN';

/**
 * Setzt XP, Ränge (abgeleitet aus Punkten) und Coins zurück – für alle
 * Mitarbeiter der Org oder eine Person. Badges (achievements) und Titelbilder/
 * Rahmen/Inventar (loot_inventory, hub_frame) bleiben unberührt.
 *
 * Punkte = erhaltene Kudos + xp_events; Coins = f(Punkte) − loot_wallets.coins_spent.
 * Daher: xp_events löschen, optional Kudos löschen, coins_spent auf 0 setzen.
 * Nur Super-Admin.
 */
export async function resetGamificationAction(input: {
  orgId: string;
  scope: 'all' | string;
  includeKudos: boolean;
  confirm: string;
}): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, scope, includeKudos, confirm } = parsed.data;

  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);
  if (confirm.trim() !== CONFIRM_WORD) {
    return errorResult(`Bitte zur Bestätigung „${CONFIRM_WORD}“ eintippen.`);
  }

  const service = createSupabaseServiceClient();
  const userId = scope === 'all' ? null : scope;

  try {
    // 1) Automatische XP (Ledger) löschen.
    {
      let q = service.from('xp_events').delete().eq('organization_id', orgId);
      if (userId) q = q.eq('user_id', userId);
      const { error } = await q;
      if (error) throw error;
    }

    // 2) Erhaltene Kollegen-Kudos löschen (optional – für echten Rang-Reset).
    if (includeKudos) {
      let q = service.from('kudos').delete().eq('organization_id', orgId);
      if (userId) q = q.eq('to_user_id', userId);
      const { error } = await q;
      if (error) throw error;
    }

    // 3) Ausgegebene Coins auf 0 – sonst würde vergangenes Ausgeben künftige
    //    Einnahmen mindern. Guthaben = f(Punkte)−spent wird damit sauber 0.
    {
      let q = service
        .from('loot_wallets')
        .update({ coins_spent: 0, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId);
      if (userId) q = q.eq('user_id', userId);
      const { error } = await q;
      if (error) throw error;
    }
  } catch (e) {
    logger.error('gamification.reset_failed', {
      error: e instanceof Error ? e.message : String(e),
      orgId,
      scope,
    });
    return errorResult(de.errors.INTERNAL);
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'gamification',
    entityId: userId ?? orgId,
    metadata: { reset: true, scope, includeKudos },
  });

  // Level/Coins werden überall live abgeleitet → betroffene Ansichten neu laden.
  for (const p of ['/app', '/app/motivation', '/app/kudos', '/app/team-radar', '/app/team']) {
    revalidatePath(p);
  }

  return successResult(
    scope === 'all'
      ? 'XP, Ränge und Coins wurden für alle Mitarbeiter zurückgesetzt.'
      : 'XP, Ränge und Coins wurden für die Person zurückgesetzt.',
  );
}
