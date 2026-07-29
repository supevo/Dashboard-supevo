import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { customBannerImageUrl } from '@/features/gamification/banners';

export interface HubBannerAdminItem {
  id: string;
  name: string;
  unlockLevel: number;
  imageUrl: string;
}

/** Lists an organization's uploaded Level-Hub banners (for the admin UI). */
export async function listHubBanners(
  orgId: string,
): Promise<HubBannerAdminItem[]> {
  // Read with the service client (org-scoped) so the admin list is independent
  // of whether the table's RLS select policy was applied.
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('hub_banner_images')
    .select('id, name, unlock_level')
    .eq('organization_id', orgId)
    .order('unlock_level', { ascending: true });

  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    unlockLevel: b.unlock_level,
    imageUrl: customBannerImageUrl(b.id),
  }));
}
