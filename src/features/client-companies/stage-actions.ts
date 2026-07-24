'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  clientCompanyId: z.string().uuid(),
  stage: z.coerce.number().int().min(1).max(2),
});

/**
 * Sets the Stage for a client: the active-task WIP limit (1 or 2) applied to
 * every project of that client. Managed at the client level so the customer's
 * capacity is one setting rather than per project.
 */
export async function setClientStageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    stage: formData.get('stage'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, stage } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);

  if (projectIds.length > 0) {
    const { data: boards } = await supabase
      .from('boards')
      .select('id')
      .in('project_id', projectIds);
    const boardIds = (boards ?? []).map((b) => b.id);

    if (boardIds.length > 0) {
      // RLS (board_columns_write → can_manage_project) restricts this to managers.
      const { error } = await supabase
        .from('board_columns')
        .update({ wip_limit: stage, wip_limit_per_user: null })
        .in('board_id', boardIds)
        .eq('column_key', 'active');
      if (error) return errorResult(de.errors.INTERNAL);
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
    metadata: { field: 'stage', stage, projects: projectIds.length },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult(`Stage ${stage} für alle Projekte gesetzt.`);
}
