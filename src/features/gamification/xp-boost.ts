import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ActiveXpBoost {
  id: string;
  title: string;
  factor: number;
  bannerUrl: string | null;
  endsAt: string;
}

/** Serving URL for a boost's uploaded banner. */
export function boostBannerUrl(id: string): string {
  return `/api/xp-boosts/${id}/banner`;
}

/**
 * The currently running XP boost for an org (active + within its time window),
 * or null. Read via the service client (org-scoped), robust to RLS policies.
 */
export async function getActiveXpBoost(orgId: string): Promise<ActiveXpBoost | null> {
  const nowIso = new Date().toISOString();
  const { data } = await createSupabaseServiceClient()
    .from('xp_boosts')
    .select('id, title, factor, banner_path, ends_at')
    .eq('organization_id', orgId)
    .eq('active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    factor: Number(data.factor) || 1,
    bannerUrl: data.banner_path ? boostBannerUrl(data.id) : null,
    endsAt: data.ends_at,
  };
}

/** Multiplier for XP awards right now (1 when no boost is active). */
export async function xpFactor(orgId: string): Promise<number> {
  const boost = await getActiveXpBoost(orgId);
  return boost ? Math.max(1, boost.factor) : 1;
}

/** Applies the active boost factor to a base XP amount (rounded). */
export function applyBoost(base: number, factor: number): number {
  return Math.round(base * factor);
}

export interface AdminXpBoost {
  id: string;
  title: string;
  factor: number;
  bannerUrl: string | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
  isRunning: boolean;
}

/** All boosts of the org for the admin editor (newest first). */
export async function listXpBoosts(orgId: string): Promise<AdminXpBoost[]> {
  const { data } = await createSupabaseServiceClient()
    .from('xp_boosts')
    .select('id, title, factor, banner_path, starts_at, ends_at, active')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  const now = Date.now();
  return (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    factor: Number(b.factor) || 1,
    bannerUrl: b.banner_path ? boostBannerUrl(b.id) : null,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    active: b.active,
    isRunning:
      b.active &&
      new Date(b.starts_at).getTime() <= now &&
      new Date(b.ends_at).getTime() >= now,
  }));
}
