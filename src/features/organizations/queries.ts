import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: 'agency' | 'client';
}

/** Loads an organization the current user can access (RLS enforced). */
export async function getOrganization(
  orgId: string,
): Promise<Organization | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('id, name, slug, type')
    .eq('id', orgId)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, name: data.name, slug: data.slug, type: data.type };
}
