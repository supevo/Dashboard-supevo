import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ReportScreenshot {
  url: string;
  caption?: string;
}

export interface MarketingReport {
  id: string;
  clientCompanyId: string;
  periodLabel: string;
  periodStart: string;
  ranking: string | null;
  sea: string | null;
  inquiries: string | null;
  summary: string | null;
  screenshots: ReportScreenshot[];
  published: boolean;
  createdAt: string;
}

function normalizeScreenshots(raw: unknown): ReportScreenshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { url: string; caption?: string } =>
      !!s && typeof (s as { url?: unknown }).url === 'string',
    )
    .map((s) => ({ url: s.url, caption: s.caption }));
}

function mapRow(r: {
  id: string;
  client_company_id: string;
  period_label: string;
  period_start: string;
  ranking: string | null;
  sea: string | null;
  inquiries: string | null;
  summary: string | null;
  screenshots: unknown;
  published: boolean;
  created_at: string;
}): MarketingReport {
  return {
    id: r.id,
    clientCompanyId: r.client_company_id,
    periodLabel: r.period_label,
    periodStart: r.period_start,
    ranking: r.ranking,
    sea: r.sea,
    inquiries: r.inquiries,
    summary: r.summary,
    screenshots: normalizeScreenshots(r.screenshots),
    published: r.published,
    createdAt: r.created_at,
  };
}

const COLS =
  'id, client_company_id, period_label, period_start, ranking, sea, inquiries, summary, screenshots, published, created_at';

/** Lists a client's marketing reports. RLS-scoped (agency: all, client: published). */
export async function listMarketingReports(
  clientCompanyId: string,
): Promise<MarketingReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('marketing_reports')
    .select(COLS)
    .eq('client_company_id', clientCompanyId)
    .order('period_start', { ascending: false })
    .limit(52);
  return (data ?? []).map(mapRow);
}

/** A single report by id. RLS-scoped. */
export async function getMarketingReport(
  id: string,
): Promise<MarketingReport | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('marketing_reports')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();
  return data ? mapRow(data) : null;
}
