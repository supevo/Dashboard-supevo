import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
}

export interface ChannelMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorHasAvatar: boolean;
  body: string;
  createdAt: string;
  isMine: boolean;
}

/** Lists the organization's active channels (alphabetical). RLS-scoped. */
export async function listChannels(orgId: string): Promise<ChatChannel[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channels')
    .select('id, name, description')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('name', { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));
}

/** A single channel by id. RLS-scoped. */
export async function getChannel(channelId: string): Promise<ChatChannel | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channels')
    .select('id, name, description')
    .eq('id', channelId)
    .maybeSingle();
  return data ? { id: data.id, name: data.name, description: data.description } : null;
}

/**
 * Lists a channel's messages (oldest first). RLS restricts rows to agency staff
 * of the organization. Author names/avatars resolved via the service client.
 */
export async function listChannelMessages(
  channelId: string,
  currentUserId: string,
  limit = 200,
): Promise<ChannelMessage[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channel_messages')
    .select('id, author_id, body, created_at')
    .eq('channel_id', channelId)
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
        .select('id, full_name, avatar_url')
        .in('id', authorIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  return data.map((m) => {
    const profile = m.author_id ? profileById.get(m.author_id) : undefined;
    return {
      id: m.id,
      authorId: m.author_id,
      authorName: profile?.full_name ?? 'Unbekannt',
      authorHasAvatar: Boolean(profile?.avatar_url),
      body: m.body,
      createdAt: m.created_at,
      isMine: m.author_id === currentUserId,
    };
  });
}
