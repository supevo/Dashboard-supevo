import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type AssetCategory = 'guideline' | 'logo' | 'access';

export interface AssetView {
  id: string;
  category: AssetCategory;
  title: string;
  url: string | null;
  username: string | null;
  notes: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** True when this asset is a stored file (downloadable), false for pure links. */
  hasFile: boolean;
  createdAt: string;
}

function toView(row: {
  id: string;
  category: string;
  title: string;
  url: string | null;
  username: string | null;
  notes: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}): AssetView {
  return {
    id: row.id,
    category: row.category as AssetCategory,
    title: row.title,
    url: row.url,
    username: row.username,
    notes: row.notes,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    hasFile: Boolean(row.storage_path),
    createdAt: row.created_at,
  };
}

const SELECT =
  'id, category, title, url, username, notes, storage_path, file_name, mime_type, size_bytes, created_at';

/**
 * All assets of a client company, for the agency. RLS restricts this to agency
 * staff of the company's organization (includes the 'access' references).
 */
export async function listCompanyAssets(
  clientCompanyId: string,
): Promise<AssetView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_assets')
    .select(SELECT)
    .eq('client_company_id', clientCompanyId)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });
  return (data ?? []).map(toView);
}

/**
 * Client-visible assets (guidelines + logos only — never access references).
 * The client_assets table is agency-only in RLS, so we verify the caller is a
 * contact of the company and then read via the service client.
 */
export async function listClientAssets(): Promise<{
  companyName: string;
  assets: AssetView[];
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('client_company_id')
    .limit(1)
    .maybeSingle();
  if (!contact) return null;

  const service = createSupabaseServiceClient();
  const [{ data: company }, { data }] = await Promise.all([
    service
      .from('client_companies')
      .select('name')
      .eq('id', contact.client_company_id)
      .maybeSingle(),
    service
      .from('client_assets')
      .select(SELECT)
      .eq('client_company_id', contact.client_company_id)
      .in('category', ['guideline', 'logo'])
      .order('category', { ascending: true })
      .order('created_at', { ascending: false }),
  ]);

  return {
    companyName: company?.name ?? '',
    assets: (data ?? []).map(toView),
  };
}
