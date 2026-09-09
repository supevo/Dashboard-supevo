'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { syncStageActiveTaskLimit } from '@/features/memberships/configurator-queries';
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

  // Gemeinsame Logik mit der Mitgliedschaft: WIP-Limit der aktive-Spalte = Stufe.
  await syncStageActiveTaskLimit(supabase, clientCompanyId, stage);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
    metadata: { field: 'stage', stage },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult(`Stage ${stage} für alle Projekte gesetzt.`);
}
