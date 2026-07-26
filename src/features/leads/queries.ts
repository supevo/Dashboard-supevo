import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export {
  LEAD_STATUSES,
  type LeadStatus,
  type Lead,
} from '@/features/leads/types';
import type { Lead } from '@/features/leads/types';

/** Lists the org's leads (newest first). RLS-scoped to agency staff. */
export async function listLeads(): Promise<Lead[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('leads')
    .select(
      'id, contact_name, company, email, phone, source, note, estimated_value_cents, status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);
  return (data ?? []).map((l) => ({
    id: l.id,
    contactName: l.contact_name,
    company: l.company,
    email: l.email,
    phone: l.phone,
    source: l.source,
    note: l.note,
    estimatedValueCents: l.estimated_value_cents,
    status: l.status,
    createdAt: l.created_at,
  }));
}
