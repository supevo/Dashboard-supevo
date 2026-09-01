import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

import type { InquiryStatus } from '@/features/inquiries/status';
export type { InquiryStatus };
import { normalizeCategory, type InquiryCategory } from '@/features/inquiries/categories';

export interface InquiryComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface WebInquiry {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string | null;
  source: string | null;
  status: InquiryStatus;
  isSpam: boolean;
  /** KI-Gewerk-Kategorie (Badge) oder null. */
  category: InquiryCategory | null;
  /** KI-Dringlichkeit 1–10 oder null. */
  aiUrgency: number | null;
  /** KI-Auftragspotenzial 1–10 oder null. */
  aiPotential: number | null;
  createdAt: string;
  comments: InquiryComment[];
}

export interface InquiryEndpoint {
  clientCompanyId: string;
  token: string;
  enabled: boolean;
  clientVisible: boolean;
}

/** The webhook endpoint for a client company (agency view). RLS-scoped. */
export async function getInquiryEndpoint(
  clientCompanyId: string,
): Promise<InquiryEndpoint | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('inquiry_endpoints')
    .select('client_company_id, token, enabled, client_visible')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return data
    ? {
        clientCompanyId: data.client_company_id,
        token: data.token,
        enabled: data.enabled,
        clientVisible: data.client_visible ?? false,
      }
    : null;
}

/** Whether the current client has an enabled inquiry inbox (for nav gating). */
export async function isInquiryInboxEnabled(
  clientCompanyId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('inquiry_endpoints')
    .select('enabled')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return Boolean(data?.enabled);
}

/** Whether the client may see the Kundenanfragen board in the portal. */
export async function isInquiryClientVisible(
  clientCompanyId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('inquiry_endpoints')
    .select('client_visible')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return Boolean(data?.client_visible);
}

/** Lists inquiries for a client company with their comments. RLS-scoped. */
export async function listInquiries(
  clientCompanyId: string,
): Promise<WebInquiry[]> {
  const supabase = await createSupabaseServerClient();
  const { data: inquiries } = await supabase
    .from('web_inquiries')
    // '*' + Cast: category/ai_urgency/ai_potential (0176) noch nicht getypt.
    .select('*')
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!inquiries || inquiries.length === 0) return [];

  const ids = inquiries.map((i) => i.id);
  const { data: comments } = await supabase
    .from('inquiry_comments')
    .select('id, inquiry_id, author_id, body, created_at')
    .in('inquiry_id', ids)
    .order('created_at', { ascending: true });

  // Author names via service client (profiles of both agency + client users).
  const authorIds = [
    ...new Set((comments ?? []).map((c) => c.author_id).filter((v): v is string => !!v)),
  ];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const service = createSupabaseServiceClient();
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name ?? '—');
  }

  const commentsByInquiry = new Map<string, InquiryComment[]>();
  for (const c of comments ?? []) {
    const list = commentsByInquiry.get(c.inquiry_id) ?? [];
    list.push({
      id: c.id,
      authorName: c.author_id ? nameById.get(c.author_id) ?? '—' : '—',
      body: c.body,
      createdAt: c.created_at,
    });
    commentsByInquiry.set(c.inquiry_id, list);
  }

  return inquiries.map((i) => ({
    id: i.id,
    name: i.name,
    email: i.email,
    phone: i.phone,
    subject: i.subject,
    message: i.message,
    source: i.source,
    status: i.status,
    isSpam: i.is_spam ?? false,
    category: normalizeCategory((i as { category?: unknown }).category),
    aiUrgency: (i as { ai_urgency?: number | null }).ai_urgency ?? null,
    aiPotential: (i as { ai_potential?: number | null }).ai_potential ?? null,
    createdAt: i.created_at,
    comments: commentsByInquiry.get(i.id) ?? [],
  }));
}
