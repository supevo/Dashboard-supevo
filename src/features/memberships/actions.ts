'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { isOrgAdmin } from '@/lib/authz/policies';
import { changeRoleSchema, memberTargetSchema, joinDateSchema } from './schema';

/** Changes a member's role. The central policy rejects self-changes and
 *  super_admin; RLS enforces the same at the database level. */
export async function changeRoleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse({
    orgId: formData.get('orgId'),
    targetUserId: formData.get('targetUserId'),
    nextRole: formData.get('nextRole'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, targetUserId, nextRole } = parsed.data;

  const user = await requireUser();
  authorize(user, {
    type: 'member.changeRole',
    orgId,
    targetUserId,
    nextRole,
  });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('memberships')
    .update({ role: nextRole })
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId);

  if (error) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'role_change',
    entityType: 'membership',
    entityId: targetUserId,
    metadata: { nextRole },
  });

  revalidatePath('/app/team');
  return successResult('Rolle aktualisiert.');
}

async function setMemberStatus(
  formData: FormData,
  status: 'active' | 'suspended',
): Promise<ActionResult> {
  const parsed = memberTargetSchema.safeParse({
    orgId: formData.get('orgId'),
    targetUserId: formData.get('targetUserId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, targetUserId } = parsed.data;

  const user = await requireUser();
  authorize(user, {
    type: status === 'suspended' ? 'member.deactivate' : 'member.reactivate',
    orgId,
    targetUserId,
  });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('memberships')
    .update({ status })
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId);

  if (error) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: status === 'suspended' ? 'member_deactivate' : 'member_reactivate',
    entityType: 'membership',
    entityId: targetUserId,
  });

  revalidatePath('/app/team');
  return successResult(
    status === 'suspended' ? 'Benutzer deaktiviert.' : 'Benutzer aktiviert.',
  );
}

/** Admins/super-admins set (or clear) a member's real company start date. */
export async function setJoinDateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = joinDateSchema.safeParse({
    orgId: formData.get('orgId'),
    targetUserId: formData.get('targetUserId'),
    joinedAt: formData.get('joinedAt'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, targetUserId, joinedAt } = parsed.data;

  const user = await requireUser();
  if (!isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  // The join date is harmless tenure data, but the memberships RLS update policy
  // forbids self-updates and any change to a super_admin row – so an admin (and
  // especially a super_admin) can't set their OWN Eintrittsdatum through the
  // RLS client. Authorization is already enforced above via isOrgAdmin, so we
  // apply this one field with the service client.
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('memberships')
    .update({ joined_company_at: joinedAt === '' ? null : joinedAt })
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId);

  if (error) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'role_change',
    entityType: 'membership',
    entityId: targetUserId,
    metadata: { joinedAt: joinedAt || null },
  });

  revalidatePath('/app/team');
  revalidatePath('/app/kudos');
  return successResult('Eintrittsdatum gespeichert.');
}

export async function deactivateMemberAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setMemberStatus(formData, 'suspended');
}

export async function reactivateMemberAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setMemberStatus(formData, 'active');
}
