import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
}

export interface DmConversation {
  id: string;
  otherUserId: string;
  otherName: string;
  otherHasAvatar: boolean;
}

export interface TeamMember {
  userId: string;
  name: string;
  hasAvatar: boolean;
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

/** Lists the org's accessible channels (public + private the user is in). */
export async function listChannels(orgId: string): Promise<ChatChannel[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channels')
    .select('id, name, description, is_private')
    .eq('organization_id', orgId)
    .eq('kind', 'channel')
    .eq('is_archived', false)
    .order('name', { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    isPrivate: c.is_private,
  }));
}

/** Lists the current user's direct-message conversations with the other party. */
export async function listDmConversations(
  orgId: string,
  userId: string,
): Promise<DmConversation[]> {
  const supabase = await createSupabaseServerClient();
  // RLS returns only DMs the user is a member of.
  const { data: dms } = await supabase
    .from('chat_channels')
    .select('id')
    .eq('organization_id', orgId)
    .eq('kind', 'dm');
  const dmIds = (dms ?? []).map((d) => d.id);
  if (dmIds.length === 0) return [];

  const { data: members } = await supabase
    .from('chat_channel_members')
    .select('channel_id, user_id')
    .in('channel_id', dmIds);

  const otherByChannel = new Map<string, string>();
  for (const m of members ?? []) {
    if (m.user_id !== userId) otherByChannel.set(m.channel_id, m.user_id);
  }
  const otherIds = [...new Set(otherByChannel.values())];
  if (otherIds.length === 0) return [];

  const service = createSupabaseServiceClient();
  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', otherIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  return dmIds
    .map((id) => {
      const otherId = otherByChannel.get(id);
      if (!otherId) return null;
      const p = profileById.get(otherId);
      return {
        id,
        otherUserId: otherId,
        otherName: p?.full_name ?? 'Unbekannt',
        otherHasAvatar: Boolean(p?.avatar_url),
      };
    })
    .filter((d): d is DmConversation => d !== null);
}

/** Lists the org's active agency team members (for DMs / private members). */
export async function listTeamMembers(
  orgId: string,
  excludeUserId?: string,
): Promise<TeamMember[]> {
  const service = createSupabaseServiceClient();
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const ids = [
    ...new Set(
      (memberships ?? [])
        .filter((m) => m.role !== 'client' && m.user_id !== excludeUserId)
        .map((m) => m.user_id),
    ),
  ];
  if (ids.length === 0) return [];

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', ids);
  return (profiles ?? [])
    .map((p) => ({
      userId: p.id,
      name: p.full_name ?? 'Unbekannt',
      hasAvatar: Boolean(p.avatar_url),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Unread message counts per channel for the current user. */
export async function getUnreadCounts(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('chat_unread_counts');
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.channel_id] = Number(row.unread);
  return out;
}

/** A single channel by id. RLS-scoped. */
export async function getChannel(channelId: string): Promise<ChatChannel | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channels')
    .select('id, name, description, is_private')
    .eq('id', channelId)
    .maybeSingle();
  return data
    ? { id: data.id, name: data.name, description: data.description, isPrivate: data.is_private }
    : null;
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
