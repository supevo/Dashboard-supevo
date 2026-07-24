'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasClientAccess } from '@/features/auth/access';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({ stage: z.coerce.number().int().min(1).max(2) });

/**
 * Lets a client switch their own membership Stage (1/2). Moving to a Stage
 * applies that Stage's standard price (any custom override is cleared). Writes
 * go through the service client because client_memberships is org-admin-write
 * under RLS; the client's ownership is verified first via an RLS-scoped read.
 */
export async function switchPortalStageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ stage: formData.get('stage') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { stage } = parsed.data;

  const user = await requireUser();
  if (!hasClientAccess(user)) return errorResult(de.errors.FORBIDDEN);

  // RLS returns only the caller's own membership.
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from('client_memberships')
    .select('id, organization_id, client_company_id, stage')
    .limit(1)
    .maybeSingle();
  if (!membership) return errorResult('Keine Mitgliedschaft gefunden.');
  if (membership.stage === stage) return successResult('Bereits aktiv.');

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('client_memberships')
    .update({ stage, custom_name: null, custom_net_cents: null })
    .eq('id', membership.id);
  if (error) return errorResult(de.errors.INTERNAL);

  // Keep the active-task WIP limit in sync (Stage 1 = 1, Stage 2 = 2).
  const { data: projects } = await service
    .from('projects')
    .select('id')
    .eq('client_company_id', membership.client_company_id)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length > 0) {
    const { data: boards } = await service
      .from('boards')
      .select('id')
      .in('project_id', projectIds);
    const boardIds = (boards ?? []).map((b) => b.id);
    if (boardIds.length > 0) {
      await service
        .from('board_columns')
        .update({ wip_limit: stage, wip_limit_per_user: null })
        .in('board_id', boardIds)
        .eq('column_key', 'active');
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: membership.organization_id,
    action: 'update',
    entityType: 'client_membership',
    entityId: membership.client_company_id,
    metadata: { stage, via: 'portal' },
  });

  revalidatePath('/portal');
  return successResult(`Auf Stage ${stage} umgestellt.`);
}
