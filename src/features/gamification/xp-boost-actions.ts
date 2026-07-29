'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';

async function adminOrg(): Promise<string | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  return orgId && isOrgAdmin(user, orgId) ? orgId : null;
}

/** Enables/disables an XP boost. */
export async function setXpBoostActiveAction(id: string, active: boolean): Promise<void> {
  if (!z.string().uuid().safeParse(id).success) return;
  const orgId = await adminOrg();
  if (!orgId) return;
  await createSupabaseServiceClient()
    .from('xp_boosts')
    .update({ active })
    .eq('id', id)
    .eq('organization_id', orgId);
  revalidatePath('/app/challenges');
  revalidatePath('/app/kudos');
}

/** Deletes an XP boost (and its banner). */
export async function deleteXpBoostAction(id: string): Promise<void> {
  if (!z.string().uuid().safeParse(id).success) return;
  const orgId = await adminOrg();
  if (!orgId) return;
  const service = createSupabaseServiceClient();
  const { data: boost } = await service
    .from('xp_boosts')
    .select('banner_path')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  await service.from('xp_boosts').delete().eq('id', id).eq('organization_id', orgId);
  if (boost?.banner_path) {
    await service.storage.from(FILES_BUCKET).remove([boost.banner_path]);
  }
  revalidatePath('/app/challenges');
  revalidatePath('/app/kudos');
}
