'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { LEAGUES } from '@/features/gamification/leagues';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/**
 * Saves the org's custom league symbols. For each league, an empty value resets
 * to the code default (row deleted); a non-empty value (first 8 chars, e.g. an
 * emoji) is stored. Admin-only.
 */
export async function setLeagueSymbolsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const rls = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  const toUpsert: { organization_id: string; league_key: string; symbol: string }[] = [];
  const toDelete: string[] = [];
  for (const league of LEAGUES) {
    const raw = String(formData.get(`sym_${league.key}`) ?? '').trim().slice(0, 8);
    if (raw) toUpsert.push({ organization_id: orgId, league_key: league.key, symbol: raw });
    else toDelete.push(league.key);
  }

  // Access gate through RLS (org-admin write policy) — use it for the writes.
  if (toUpsert.length > 0) {
    const { error } = await rls
      .from('league_symbols')
      .upsert(toUpsert, { onConflict: 'organization_id,league_key' });
    if (error) return errorResult(de.errors.INTERNAL);
  }
  if (toDelete.length > 0) {
    // Reset unset leagues to default by removing any stored override.
    await service
      .from('league_symbols')
      .delete()
      .eq('organization_id', orgId)
      .in('league_key', toDelete);
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/kudos');
  return successResult('Liga-Symbole gespeichert.');
}
