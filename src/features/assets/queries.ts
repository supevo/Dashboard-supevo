import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type AssetCategory = 'guideline' | 'logo' | 'access';

export interface Brand {
  id: string;
  name: string;
}

export interface AssetView {
  id: string;
  brandId: string | null;
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
  /** True when an access entry has an encrypted password stored (agency reveals). */
  hasSecret: boolean;
  createdAt: string;
}

interface AssetRow {
  id: string;
  brand_id: string | null;
  category: string;
  title: string;
  url: string | null;
  username: string | null;
  notes: string | null;
  secret_encrypted: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

// Never selects secret_encrypted's value into a client-facing shape beyond a
// boolean; the ciphertext stays server-side.
function toView(row: AssetRow): AssetView {
  return {
    id: row.id,
    brandId: row.brand_id,
    category: row.category as AssetCategory,
    title: row.title,
    url: row.url,
    username: row.username,
    notes: row.notes,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    hasFile: Boolean(row.storage_path),
    hasSecret: Boolean(row.secret_encrypted),
    createdAt: row.created_at,
  };
}

const SELECT =
  'id, brand_id, category, title, url, username, notes, secret_encrypted, storage_path, file_name, mime_type, size_bytes, created_at';

export interface CompanyHub {
  brands: Brand[];
  assets: AssetView[];
}

/**
 * Full Marken-Hub of a client company, for the agency. RLS restricts this to
 * agency staff of the company's organization (includes 'access' references).
 */
export async function listCompanyHub(
  clientCompanyId: string,
): Promise<CompanyHub> {
  const supabase = await createSupabaseServerClient();
  const [{ data: brands }, { data: assets }] = await Promise.all([
    supabase
      .from('client_brands')
      .select('id, name')
      .eq('client_company_id', clientCompanyId)
      .order('name', { ascending: true }),
    supabase
      .from('client_assets')
      .select(SELECT)
      .eq('client_company_id', clientCompanyId)
      .order('created_at', { ascending: false }),
  ]);
  return {
    brands: (brands ?? []).map((b) => ({ id: b.id, name: b.name })),
    assets: (assets ?? []).map(toView),
  };
}

export interface ClientHub extends CompanyHub {
  clientCompanyId: string;
  companyName: string;
}

/**
 * Client-facing Marken-Hub (brands + guideline/logo assets — never access
 * references). The tables are agency-only in RLS, so we verify the caller is a
 * contact of a company and read via the service client.
 */
export async function listClientHub(): Promise<ClientHub | null> {
  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('client_company_id')
    .limit(1)
    .maybeSingle();
  if (!contact) return null;

  const companyId = contact.client_company_id;
  const service = createSupabaseServiceClient();
  const [{ data: company }, { data: brands }, { data: assets }] =
    await Promise.all([
      service
        .from('client_companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle(),
      service
        .from('client_brands')
        .select('id, name')
        .eq('client_company_id', companyId)
        .order('name', { ascending: true }),
      service
        .from('client_assets')
        .select(SELECT)
        .eq('client_company_id', companyId)
        // Logos + guidelines, plus access logins the client themselves may see.
        .or(
          'category.in.(guideline,logo),and(category.eq.access,client_visible.eq.true)',
        )
        .order('created_at', { ascending: false }),
    ]);

  return {
    clientCompanyId: companyId,
    companyName: company?.name ?? '',
    brands: (brands ?? []).map((b) => ({ id: b.id, name: b.name })),
    assets: (assets ?? []).map(toView),
  };
}
