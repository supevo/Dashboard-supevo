'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { METRIC_BY_KEY } from '@/features/gamification/challenge-metrics';
import { mondayOf } from '@/features/gamification/week';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';

/** Resolves the calling admin's org, or null when not permitted. */
async function requireAdminOrg(): Promise<{ userId: string; orgId: string } | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return null;
  return { userId: user.id, orgId };
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  emoji: z.string().trim().min(1).max(8).default('🏆'),
  metric: z.string().trim(),
  target: z.coerce.number().int().min(1).max(100000),
  xp: z.coerce.number().int().min(0).max(100000),
  kind: z.enum(['weekly', 'team']),
  badgeName: z.string().trim().max(60).optional().or(z.literal('')),
  badgeEmoji: z.string().trim().max(8).optional().or(z.literal('')),
  weekDate: z.string().trim(), // any date in the target week
});

/** Creates (schedules) a custom challenge for a chosen week. Admins only. */
export async function createChallengeAction(input: unknown): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte alle Pflichtfelder korrekt ausfüllen.');
  const v = parsed.data;
  if (!METRIC_BY_KEY.has(v.metric)) return errorResult('Unbekannter Auslöser.');

  const ctx = await requireAdminOrg();
  if (!ctx) return errorResult('Keine Berechtigung.');

  const hasBadge = Boolean(v.badgeName && v.badgeName.trim());
  const { error } = await createSupabaseServiceClient().from('custom_challenges').insert({
    organization_id: ctx.orgId,
    title: v.title,
    description: v.description || null,
    emoji: v.emoji || '🏆',
    metric: v.metric,
    target: v.target,
    xp: v.xp,
    kind: v.kind,
    badge_key: hasBadge ? randomUUID() : null,
    badge_name: hasBadge ? v.badgeName : null,
    badge_emoji: hasBadge ? v.badgeEmoji || '🏅' : null,
    week_start: mondayOf(v.weekDate),
    created_by: ctx.userId,
  });
  if (error) return errorResult(`Speichern fehlgeschlagen: ${error.message}`);

  revalidatePath('/app/challenges');
  return successResult('Challenge angelegt.');
}

const idSchema = z.string().uuid();

/** Enables/disables a challenge (published or not). */
export async function setChallengeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return errorResult('Ungültig.');
  const ctx = await requireAdminOrg();
  if (!ctx) return errorResult('Keine Berechtigung.');
  const { error } = await createSupabaseServiceClient()
    .from('custom_challenges')
    .update({ active })
    .eq('id', id)
    .eq('organization_id', ctx.orgId);
  if (error) return errorResult(error.message);
  revalidatePath('/app/challenges');
  return successResult('Aktualisiert.');
}

/** Deletes a challenge. Earned badges stay with the users who got them. */
export async function deleteChallengeAction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return errorResult('Ungültig.');
  const ctx = await requireAdminOrg();
  if (!ctx) return errorResult('Keine Berechtigung.');
  const { error } = await createSupabaseServiceClient()
    .from('custom_challenges')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.orgId);
  if (error) return errorResult(error.message);
  revalidatePath('/app/challenges');
  return successResult('Gelöscht.');
}

const reactivateSchema = z.object({ id: z.string().uuid(), weekDate: z.string().trim() });

/**
 * Re-runs an existing challenge in another week, reusing the SAME badge (same
 * badge_key), so people who missed it can still earn it.
 */
export async function reactivateChallengeAction(input: unknown): Promise<ActionResult> {
  const parsed = reactivateSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültig.');
  const ctx = await requireAdminOrg();
  if (!ctx) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const { data: src } = await service
    .from('custom_challenges')
    .select('title, description, emoji, metric, target, xp, kind, badge_key, badge_name, badge_emoji')
    .eq('id', parsed.data.id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!src) return errorResult('Challenge nicht gefunden.');

  const { error } = await service.from('custom_challenges').insert({
    organization_id: ctx.orgId,
    title: src.title,
    description: src.description,
    emoji: src.emoji,
    metric: src.metric,
    target: src.target,
    xp: src.xp,
    kind: src.kind,
    badge_key: src.badge_key, // reuse same badge
    badge_name: src.badge_name,
    badge_emoji: src.badge_emoji,
    week_start: mondayOf(parsed.data.weekDate),
    created_by: ctx.userId,
  });
  if (error) return errorResult(error.message);

  revalidatePath('/app/challenges');
  return successResult('Challenge reaktiviert.');
}
