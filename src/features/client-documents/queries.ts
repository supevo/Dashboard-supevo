import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type DocKind = 'sepa_mandate' | 'contract';
export type DocSource = 'upload' | 'onedrive_folder' | 'onedrive_file';

export interface ClientDocument {
  id: string;
  kind: DocKind;
  source: DocSource;
  filePath: string | null;
  onedriveItemId: string | null;
  webUrl: string | null;
  name: string;
}

/** Hinterlegte Dokumente (SEPA-Mandat, Vertrag) eines Kunden. */
export async function getClientDocuments(
  clientCompanyId: string,
): Promise<ClientDocument[]> {
  const { data } = await createSupabaseServiceClient()
    .from('client_documents')
    .select('id, kind, source, file_path, onedrive_item_id, web_url, name')
    .eq('client_company_id', clientCompanyId);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    source: r.source,
    filePath: r.file_path,
    onedriveItemId: r.onedrive_item_id,
    webUrl: r.web_url,
    name: r.name,
  }));
}
