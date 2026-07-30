import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { frameImageUrl } from '@/features/gamification/frames';

export interface HubFrameAdminItem {
  id: string;
  name: string;
  unlockLevel: number;
  exclusive: boolean;
  coinPrice: number;
  imageUrl: string;
}

/** Lists an organization's uploaded profile frames (for the admin UI). */
export async function listHubFrames(
  orgId: string,
): Promise<HubFrameAdminItem[]> {
  // Read with the service client (org-scoped) so the admin list is independent
  // of whether the table's RLS select policy was applied.
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('hub_frame_images')
    .select('id, name, unlock_level, exclusive, coin_price')
    .eq('organization_id', orgId)
    .order('unlock_level', { ascending: true });

  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    unlockLevel: f.unlock_level,
    exclusive: Boolean(f.exclusive),
    coinPrice: f.coin_price ?? 0,
    imageUrl: frameImageUrl(f.id),
  }));
}
