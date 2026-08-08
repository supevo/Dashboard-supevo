import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ClientPageStatus } from './schema';

export interface ClientPage {
  id: string;
  parentId: string | null;
  isFolder: boolean;
  title: string;
  content: string;
  status: ClientPageStatus;
  position: number;
  updatedAt: string;
}

/**
 * Lists a client's internal pages/folders (team-only). Returns [] if the
 * client_pages table is not present yet (migration 0107 not applied), so the
 * client detail page keeps working before the migration is run.
 */
export async function listClientPages(
  clientCompanyId: string,
): Promise<ClientPage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('client_pages')
    .select('id, parent_id, is_folder, title, content, status, position, updated_at')
    .eq('client_company_id', clientCompanyId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return [];

  // client_pages is not in the generated Database types (added by migration
  // 0107); cast the rows to their known shape.
  const rows = (data ?? []) as unknown as {
    id: string;
    parent_id: string | null;
    is_folder: boolean;
    title: string;
    content: string | null;
    status: ClientPageStatus;
    position: number;
    updated_at: string;
  }[];

  return rows.map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    isFolder: p.is_folder,
    title: p.title,
    content: p.content ?? '',
    status: p.status,
    position: p.position,
    updatedAt: p.updated_at,
  }));
}
