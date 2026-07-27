import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ClientCompany {
  id: string;
  name: string;
  contactEmail: string | null;
  notes: string | null;
  industry: string | null;
  brands: string | null;
  interests: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Lists client companies of an organization. RLS ensures agency staff see
 *  their org's companies and clients only their own. */
export async function listClientCompanies(
  orgId: string,
): Promise<ClientCompany[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_companies')
    .select('id, name, contact_email, notes, is_active, created_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    contactEmail: c.contact_email,
    notes: c.notes,
    industry: null,
    brands: null,
    interests: null,
    isActive: c.is_active,
    createdAt: c.created_at,
  }));
}

export async function getClientCompany(
  orgId: string,
  clientCompanyId: string,
): Promise<ClientCompany | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_companies')
    .select('id, name, contact_email, notes, industry, brands, interests, is_active, created_at')
    .eq('organization_id', orgId)
    .eq('id', clientCompanyId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    contactEmail: data.contact_email,
    notes: data.notes,
    industry: data.industry,
    brands: data.brands,
    interests: data.interests,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}

/**
 * Derives the client's current Stage from its projects' active-task columns.
 * All of a client's projects are kept in sync, so the first non-null WIP limit
 * wins; defaults to 2 when nothing is set yet or the client has no projects.
 */
export async function getClientStage(clientCompanyId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return 2;

  const { data: boards } = await supabase
    .from('boards')
    .select('id')
    .in('project_id', projectIds);
  const boardIds = (boards ?? []).map((b) => b.id);
  if (boardIds.length === 0) return 2;

  const { data: columns } = await supabase
    .from('board_columns')
    .select('wip_limit')
    .in('board_id', boardIds)
    .eq('column_key', 'active');
  const withLimit = (columns ?? []).find((c) => c.wip_limit != null);
  return withLimit?.wip_limit ?? 2;
}

export interface ClientContactRow {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  isPrimary: boolean;
}

/** Lists the contacts assigned to a client company. */
export async function listClientContacts(
  orgId: string,
  clientCompanyId: string,
): Promise<ClientContactRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('id, user_id, is_primary')
    .eq('organization_id', orgId)
    .eq('client_company_id', clientCompanyId);

  if (!contacts || contacts.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      contacts.map((c) => c.user_id),
    );
  const byId = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  return contacts.map((c) => {
    const profile = byId.get(c.user_id);
    return {
      id: c.id,
      userId: c.user_id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      isPrimary: c.is_primary,
    };
  });
}
