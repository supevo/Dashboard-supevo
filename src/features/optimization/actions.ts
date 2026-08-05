'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { runWorkloadOptimization } from '@/features/optimization/engine';
import { getOptimizationSettings } from '@/features/optimization/queries';
import { logger } from '@/lib/logger';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

function adminOrgId(user: Awaited<ReturnType<typeof requireUser>>): string | null {
  const orgId = primaryAgencyOrgId(user);
  return orgId && isOrgAdmin(user, orgId) ? orgId : null;
}

const settingsSchema = z.object({
  cadence: z.enum(['off', 'daily', 'every_2_days', 'weekly']),
  autoApply: z.boolean(),
  reassign: z.boolean(),
});

/** Saves the org's optimization schedule + automatic-mode settings (admins). */
export async function updateOptimizationSettingsAction(input: {
  cadence: string;
  autoApply: boolean;
  reassign: boolean;
}): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Eingabe.');

  const user = await requireUser();
  const orgId = adminOrgId(user);
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const { error } = await service.from('work_optimization_settings').upsert(
    {
      organization_id: orgId,
      cadence: parsed.data.cadence,
      auto_apply: parsed.data.autoApply,
      reassign: parsed.data.reassign,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );
  if (error) {
    logger.error('optimization.settings.save_failed', {
      error: error.message,
      code: error.code,
    });
    return errorResult('Speichern fehlgeschlagen.');
  }

  revalidatePath('/app/workload');
  return successResult('Einstellungen gespeichert.');
}

/** Runs the optimization now and applies the changes (admin, manual). */
export async function applyWorkloadOptimizationAction(): Promise<
  { ok: true; message: string; changes: string[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  const orgId = adminOrgId(user);
  if (!orgId) return { ok: false, error: 'Keine Berechtigung.' };

  const settings = await getOptimizationSettings(orgId);
  const result = await runWorkloadOptimization(orgId, user.id, {
    reassign: settings.reassign,
  });

  const service = createSupabaseServiceClient();
  await service.from('work_optimization_settings').upsert(
    { organization_id: orgId, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: 'organization_id' },
  );

  revalidatePath('/app/workload');
  const total = result.assigned + result.reassigned;
  const message =
    total === 0
      ? 'Nichts zu optimieren – die Verteilung passt bereits.'
      : `${result.assigned} zugewiesen, ${result.reassigned} umverteilt.`;
  return { ok: true, message, changes: result.changes };
}
