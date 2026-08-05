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
 * Saves the org's custom league symbols (emoji). For each league, an empty value
 * clears the custom emoji; a non-empty value (first 8 chars) is stored. An
 * uploaded image on that league is always preserved — a row is only fully
 * removed when it has neither a custom emoji nor an image. Admin-only.
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

  // Which leagues currently carry an uploaded image — those rows must survive an
  // empty emoji (only the symbol is cleared, the image stays).
  const { data: existing } = await service
    .from('league_symbols')
    .select('league_key, image_path')
    .eq('organization_id', orgId);
  const hasImage = new Set(
    (existing ?? []).filter((r) => r.image_path).map((r) => r.league_key),
  );

  const toUpsert: { organization_id: string; league_key: string; symbol: string }[] = [];
  const toClear: string[] = []; // keep the image, drop the emoji
  const toDelete: string[] = []; // no emoji, no image → remove row entirely
  for (const league of LEAGUES) {
    const raw = String(formData.get(`sym_${league.key}`) ?? '').trim().slice(0, 8);
    if (raw) toUpsert.push({ organization_id: orgId, league_key: league.key, symbol: raw });
    else if (hasImage.has(league.key)) toClear.push(league.key);
    else toDelete.push(league.key);
  }

  // Access gate through RLS (org-admin write policy) — use it for the writes.
  if (toUpsert.length > 0) {
    const { error } = await rls
      .from('league_symbols')
      .upsert(toUpsert, { onConflict: 'organization_id,league_key' });
    if (error) return errorResult(de.errors.INTERNAL);
  }
  if (toClear.length > 0) {
    await rls
      .from('league_symbols')
      .update({ symbol: null })
      .eq('organization_id', orgId)
      .in('league_key', toClear);
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
