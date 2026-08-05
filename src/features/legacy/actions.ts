'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { LEGACY_PACKAGES } from './packages';

/** Parses a German-formatted euro amount ("180", "180,00", "1.234,50") to cents,
 *  or null when the field is empty. */
function euroToCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const schema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  isLegacy: z.enum(['true', 'false']),
  package: z.enum(LEGACY_PACKAGES as unknown as [string, ...string[]]),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * Marks a client as a legacy customer and stores its package, an optional
 * free-entry net price (for negotiated discounts) and – for Performance – the
 * separately carried ad budgets. Admin-only.
 */
export async function updateLegacySettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    isLegacy: formData.get('isLegacy'),
    package: formData.get('package'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, clientCompanyId, isLegacy, notes } = parsed.data;
  const pkg = parsed.data.package;

  const customPriceCents = euroToCents(formData.get('customPrice'));
  const googleAdsBudgetCents = euroToCents(formData.get('googleAdsBudget'));
  const metaBudgetCents = euroToCents(formData.get('metaBudget'));

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();

  // Verify the client belongs to this org (also acts as an access gate).
  const { data: company } = await supabase
    .from('client_companies')
    .select('id')
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!company) return errorResult(de.errors.NOT_FOUND);

  const legacy = isLegacy === 'true';

  const { error: flagError } = await supabase
    .from('client_companies')
    .update({ is_legacy: legacy })
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId);
  if (flagError) return errorResult(de.errors.INTERNAL);

  // Ad budgets only make sense for the Performance package.
  const isPerformance = pkg === 'performance';

  const { error: settingsError } = await supabase
    .from('legacy_client_settings')
    .upsert(
      {
        client_company_id: clientCompanyId,
        organization_id: orgId,
        package: pkg,
        custom_price_cents: customPriceCents,
        google_ads_budget_cents: isPerformance ? googleAdsBudgetCents : null,
        meta_budget_cents: isPerformance ? metaBudgetCents : null,
        notes: notes || null,
      },
      { onConflict: 'client_company_id' },
    );
  if (settingsError) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
    metadata: { legacy, package: pkg },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/app/projects');
  return successResult('Legacy-Einstellungen gespeichert.');
}
