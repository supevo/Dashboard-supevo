'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { BADGE_BY_KEY, badgeLabel } from '@/features/kudos/badges';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  toUserId: z.string().uuid(),
  badge: z.string().min(1).max(40),
  message: z.string().trim().max(500).optional().or(z.literal('')),
});

/** Gives kudos (with a badge + points) to a colleague. */
export async function giveKudosAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    toUserId: formData.get('toUserId'),
    badge: formData.get('badge'),
    message: formData.get('message') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { toUserId, badge, message } = parsed.data;

  const badgeDef = BADGE_BY_KEY.get(badge);
  if (!badgeDef) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  if (toUserId === user.id) {
    return errorResult('Du kannst dir nicht selbst Kudos geben. 😉');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('kudos').insert({
    organization_id: orgId,
    from_user_id: user.id,
    to_user_id: toUserId,
    badge,
    message: message ? message : null,
    points: badgeDef.points,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  await createNotifications(
    [
      {
        organizationId: orgId,
        recipientId: toUserId,
        type: 'kudos' as const,
        title: `Du hast Kudos bekommen! ${badgeLabel(badge)}`,
        body: message || `${user.fullName ?? user.email} hat dir Anerkennung gegeben.`,
        entityType: 'kudos',
        entityId: null,
      },
    ],
    user.id,
  );

  revalidatePath('/app/kudos');
  return successResult('Kudos gesendet! 🎉');
}

/** Removes a kudo (giver or admin). */
export async function deleteKudosAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('kudos').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/kudos');
  return successResult('Entfernt.');
}
