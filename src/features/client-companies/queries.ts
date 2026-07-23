import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ClientCompany {
  id: string;
  name: string;
  contactEmail: string | null;
  notes: string | null;
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
    .select('id, name, contact_email, notes, is_active, created_at')
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
    isActive: data.is_active,
    createdAt: data.created_at,
  };
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
