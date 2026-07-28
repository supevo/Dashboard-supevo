import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ChatMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorHasAvatar: boolean;
  authorStatus: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
}

/**
 * Lists the internal chat messages for a client company (oldest first).
 * RLS restricts rows to agency staff of the organization. Author names are
 * resolved via the service client (profiles are not broadly readable).
 */
export async function listClientChat(
  clientCompanyId: string,
  currentUserId: string,
  limit = 200,
): Promise<ChatMessage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_chat_messages')
    .select('id, author_id, body, created_at')
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (!data || data.length === 0) return [];

  const authorIds = [
    ...new Set(data.map((m) => m.author_id).filter((v): v is string => !!v)),
  ];
  const service = createSupabaseServiceClient();
  const { data: profiles } = authorIds.length
    ? await service
        .from('profiles')
        .select('id, full_name, avatar_url, status')
        .in('id', authorIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  return data.map((m) => {
    const profile = m.author_id ? profileById.get(m.author_id) : undefined;
    return {
      id: m.id,
      authorId: m.author_id,
      authorName: profile?.full_name ?? 'Unbekannt',
      authorHasAvatar: Boolean(profile?.avatar_url),
      authorStatus:
        profile && 'status' in profile ? (profile.status as string | null) : null,
      body: m.body,
      createdAt: m.created_at,
      isMine: m.author_id === currentUserId,
    };
  });
}
