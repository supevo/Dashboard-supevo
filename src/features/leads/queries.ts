import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  normalizeSelections,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';

export {
  LEAD_STATUSES,
  type LeadStatus,
  type Lead,
} from '@/features/leads/types';
import type { Lead } from '@/features/leads/types';

export interface LeadOfferView {
  leadId: string;
  contactName: string;
  company: string | null;
  offerName: string;
  selections: ModuleSelection[];
  priceContext: PriceContext;
  estimatedValueCents: number | null;
}

/** Loads one lead's Angebots-Baukasten (RLS-scoped to agency staff). */
export async function getLeadOffer(leadId: string): Promise<LeadOfferView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('id, organization_id, contact_name, company, modules, offer_name, estimated_value_cents')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return null;

  let priceContext: PriceContext = { stage1NetCents: 0, stage2NetCents: 0 };
  try {
    const { data: s } = await createSupabaseServiceClient()
      .from('billing_settings')
      .select('stage1_net_cents, stage2_net_cents')
      .eq('organization_id', lead.organization_id)
      .maybeSingle();
    if (s) {
      priceContext = {
        stage1NetCents: s.stage1_net_cents,
        stage2NetCents: s.stage2_net_cents,
      };
    }
  } catch {
    // keep zeros
  }

  return {
    leadId: lead.id,
    contactName: lead.contact_name,
    company: lead.company,
    offerName: lead.offer_name ?? 'Individuell',
    selections: normalizeSelections(lead.modules),
    priceContext,
    estimatedValueCents: lead.estimated_value_cents,
  };
}

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
