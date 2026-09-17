import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { livePresence } from '@/features/presence/status';

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  /** 'channel' | 'dm' | 'client'. Client channels hide stickers. */
  kind: string;
  /** Bei kind === 'client': die zugehörige Kundenfirma (für den Chat-Digest). */
  clientCompanyId?: string | null;
}

export interface DmConversation {
  id: string;
  otherUserId: string;
  otherName: string;
  otherHasAvatar: boolean;
  otherStatus: string | null;
}

export interface TeamMember {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

export interface ChannelFile {
  name: string;
  mime: string;
  size: number;
  isImage: boolean;
  keep: boolean;
  removed: boolean;
  expiresAt: string | null;
  /** Streaming/download URL (null when the file was auto-deleted after 60 days). */
  url: string | null;
}

export interface ChannelPoll {
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  closed: boolean;
  createdBy: string | null;
  /** Vote count per option (same order as options). */
  counts: number[];
  /** Distinct people who cast at least one vote. */
  totalVoters: number;
  /** Option indices the current user has voted for. */
  myVotes: number[];
}

export interface ChannelMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorHasAvatar: boolean;
  authorStatus: string | null;
  body: string;
  /** Set when the message is a sticker (team image); render instead of body. */
  stickerUrl: string | null;
  /** Set when the message carries an uploaded file. */
  file: ChannelFile | null;
  /** Set when the message is a poll (Abstimmung). */
  poll: ChannelPoll | null;
  /** Zitierte Nachricht, auf die geantwortet wurde (WhatsApp-Stil). */
  replyTo: ChannelReplyPreview | null;
  /** Emoji-Reaktionen, je Emoji zusammengefasst (👍 ×3), bestückt bester zuerst. */
  reactions: MessageReaction[];
  createdAt: string;
  isMine: boolean;
}

/** Eine zusammengefasste Emoji-Reaktion auf eine Nachricht. */
export interface MessageReaction {
  emoji: string;
  count: number;
  /** Hat der aktuelle Nutzer mit diesem Emoji reagiert? */
  mine: boolean;
}

/** Kurzvorschau der zitierten Nachricht (Autor + Textauszug/Typ). */
export interface ChannelReplyPreview {
  id: string;
  authorName: string;
  preview: string;
}

interface RawMessage {
  id: string;
  author_id: string | null;
  body: string | null;
  sticker_path: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  file_keep: boolean;
  file_removed: boolean;
  file_expires_at: string | null;
  poll_id: string | null;
  reply_to_id: string | null;
  created_at: string;
}

const MESSAGE_COLUMNS =
  'id, author_id, body, sticker_path, file_path, file_name, file_mime, file_size, file_keep, file_removed, file_expires_at, poll_id, reply_to_id, created_at';

/** Einzeiliger Vorschautext einer Nachricht (Text gekürzt, sonst Typ-Label). */
function messagePreview(m: {
  body: string | null;
  sticker_path: string | null;
  file_name: string | null;
  poll_id: string | null;
}): string {
  const body = (m.body ?? '').trim();
  if (body) return body.length > 90 ? `${body.slice(0, 90)}…` : body;
  if (m.sticker_path) return '📷 Sticker';
  if (m.file_name) return `📎 ${m.file_name}`;
  if (m.poll_id) return '📊 Umfrage';
  return '…';
}

/**
 * Löst die zitierten Ausgangsnachrichten (reply_to_id) auf: Autorname + kurze
 * Vorschau. Service-Client, nachdem die RLS-Sicht die Nachrichten schon
 * freigegeben hat (die Zitate gehören zum selben Kanal).
 */
async function loadReplyPreviews(
  rows: RawMessage[],
): Promise<Map<string, ChannelReplyPreview>> {
  const ids = [
    ...new Set(rows.map((m) => m.reply_to_id).filter((v): v is string => !!v)),
  ];
  const out = new Map<string, ChannelReplyPreview>();
  if (ids.length === 0) return out;

  const service = createSupabaseServiceClient();
  const { data: parents } = await service
    .from('chat_channel_messages')
    .select('id, author_id, body, sticker_path, file_name, poll_id')
    .in('id', ids);
  if (!parents || parents.length === 0) return out;

  const authorIds = [
    ...new Set(parents.map((p) => p.author_id).filter((v): v is string => !!v)),
  ];
  const { data: profiles } = authorIds.length
    ? await service.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? 'Unbekannt'] as const));

  for (const p of parents) {
    out.set(p.id, {
      id: p.id,
      authorName: p.author_id ? nameById.get(p.author_id) ?? 'Unbekannt' : 'Unbekannt',
      preview: messagePreview(p),
    });
  }
  return out;
}

/**
 * Loads polls referenced by the given message rows and aggregates their votes
 * into a ChannelPoll per poll id. Uses the service client (votes/polls are
 * already authorized by the message read that produced these rows).
 */
async function loadPolls(
  rows: RawMessage[],
  currentUserId: string,
): Promise<Map<string, ChannelPoll>> {
  const pollIds = [
    ...new Set(rows.map((m) => m.poll_id).filter((v): v is string => !!v)),
  ];
  const out = new Map<string, ChannelPoll>();
  if (pollIds.length === 0) return out;

  const service = createSupabaseServiceClient();
  const [{ data: polls }, { data: votes }] = await Promise.all([
    service
      .from('chat_polls')
      .select('id, question, options, allow_multiple, closed, created_by')
      .in('id', pollIds),
    service
      .from('chat_poll_votes')
      .select('poll_id, option_index, user_id')
      .in('poll_id', pollIds),
  ]);

  for (const p of polls ?? []) {
    const options = p.options ?? [];
    const pollVotes = (votes ?? []).filter((v) => v.poll_id === p.id);
    const counts = options.map(
      (_, i) => pollVotes.filter((v) => v.option_index === i).length,
    );
    const voters = new Set(pollVotes.map((v) => v.user_id));
    const myVotes = pollVotes
      .filter((v) => v.user_id === currentUserId)
      .map((v) => v.option_index);
    out.set(p.id, {
      id: p.id,
      question: p.question,
      options,
      allowMultiple: p.allow_multiple,
      closed: p.closed,
      createdBy: p.created_by,
      counts,
      totalVoters: voters.size,
      myVotes,
    });
  }
  return out;
}

/**
 * Lädt die Emoji-Reaktionen der Nachrichten und fasst sie je Nachricht/Emoji
 * zusammen (Anzahl + ob der aktuelle Nutzer dabei ist). Service-Client, nachdem
 * die RLS-Sicht die Nachrichten freigegeben hat.
 */
async function loadReactions(
  rows: RawMessage[],
  currentUserId: string,
): Promise<Map<string, MessageReaction[]>> {
  const out = new Map<string, MessageReaction[]>();
  const ids = rows.map((m) => m.id);
  if (ids.length === 0) return out;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('chat_message_reactions')
    .select('message_id, emoji, user_id')
    .in('message_id', ids);
  if (!data || data.length === 0) return out;

  // Pro Nachricht: Emoji → {count, mine}. Reihenfolge = Häufigkeit (bester zuerst).
  const byMsg = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of data) {
    const perEmoji = byMsg.get(r.message_id) ?? new Map();
    const cur = perEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.user_id === currentUserId) cur.mine = true;
    perEmoji.set(r.emoji, cur);
    byMsg.set(r.message_id, perEmoji);
  }
  for (const [messageId, perEmoji] of byMsg) {
    out.set(
      messageId,
      [...perEmoji.entries()]
        .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
        .sort((a, b) => b.count - a.count),
    );
  }
  return out;
}

/** Resolves author profiles and maps raw message rows to ChannelMessage. */
async function mapMessages(
  rows: RawMessage[],
  currentUserId: string,
): Promise<ChannelMessage[]> {
  if (rows.length === 0) return [];
  const authorIds = [
    ...new Set(rows.map((m) => m.author_id).filter((v): v is string => !!v)),
  ];
  const service = createSupabaseServiceClient();
  const { data: profiles } = authorIds.length
    ? await service
        .from('profiles')
        .select('id, full_name, avatar_url, status')
        .in('id', authorIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null; status: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));
  const pollById = await loadPolls(rows, currentUserId);
  const replyById = await loadReplyPreviews(rows);
  const reactionsByMsg = await loadReactions(rows, currentUserId);

  return rows.map((m) => {
    const profile = m.author_id ? profileById.get(m.author_id) : undefined;
    const file: ChannelFile | null = m.file_name
      ? {
          name: m.file_name,
          mime: m.file_mime ?? 'application/octet-stream',
          size: m.file_size ?? 0,
          isImage: (m.file_mime ?? '').startsWith('image/'),
          keep: m.file_keep,
          removed: m.file_removed || !m.file_path,
          expiresAt: m.file_expires_at,
          url: m.file_removed || !m.file_path ? null : `/api/chat-files/${m.id}/download`,
        }
      : null;
    return {
      id: m.id,
      authorId: m.author_id,
      authorName: profile?.full_name ?? 'Unbekannt',
      authorHasAvatar: Boolean(profile?.avatar_url),
      authorStatus: profile?.status ?? null,
      body: m.body ?? '',
      stickerUrl: m.sticker_path
        ? `/api/chat-stickers/image?path=${encodeURIComponent(m.sticker_path)}`
        : null,
      file,
      poll: m.poll_id ? pollById.get(m.poll_id) ?? null : null,
      replyTo: m.reply_to_id ? replyById.get(m.reply_to_id) ?? null : null,
      reactions: reactionsByMsg.get(m.id) ?? [],
      createdAt: m.created_at,
      isMine: m.author_id === currentUserId,
    };
  });
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
    kind: 'channel',
  }));
}

/**
 * Lists the org's client chat channels (kind = 'client'), shown separately in
 * the agency messenger. The company name is used as the channel label. Channels
 * without any message are hidden so a client that has never written does not
 * clutter the list (the channel is created lazily on first open).
 */
export async function listClientChannels(orgId: string): Promise<ChatChannel[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('chat_channels')
    .select('id, name, description, is_private, client_company_id')
    .eq('organization_id', orgId)
    .eq('kind', 'client')
    .eq('is_archived', false);
  let rows = data ?? [];

  // Keep only channels that already have at least one message.
  if (rows.length > 0) {
    const { data: withMessages } = await service
      .from('chat_channel_messages')
      .select('channel_id')
      .in(
        'channel_id',
        rows.map((c) => c.id),
      );
    const active = new Set((withMessages ?? []).map((m) => m.channel_id));
    rows = rows.filter((c) => active.has(c.id));
  }

  const companyIds = [
    ...new Set(rows.map((c) => c.client_company_id).filter((v): v is string => !!v)),
  ];
  const nameById = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await service
      .from('client_companies')
      .select('id, name')
      .in('id', companyIds);
    for (const c of companies ?? []) nameById.set(c.id, c.name);
  }
  return rows
    .map((c) => ({
      id: c.id,
      name: c.client_company_id ? (nameById.get(c.client_company_id) ?? c.name) : c.name,
      description: c.description,
      isPrivate: c.is_private,
      kind: 'client',
      clientCompanyId: c.client_company_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Lists the current user's direct-message conversations with the other party. */
export async function listDmConversations(
  orgId: string,
  userId: string,
): Promise<DmConversation[]> {
  const service = createSupabaseServiceClient();
  // DMs des Nutzers per Service-Client + Teilnahme am dm_key ermitteln, damit die
  // Liste auch dann intakt bleibt, wenn die eigene chat_channel_members-Zeile
  // fehlt (durch purge/Sweep aus 0140) oder die Org abweicht. Reihenfolge nach
  // created_at, damit der Dedupe unten den ÄLTESTEN Kanal je Partner behält (wie
  // openDmAction ihn auflöst) – Overview und geöffneter Chat bleiben konsistent.
  const { data: dms } = await service
    .from('chat_channels')
    .select('id, dm_key')
    .eq('organization_id', orgId)
    .eq('kind', 'dm')
    .order('created_at', { ascending: true });
  const allDms = (dms ?? []) as { id: string; dm_key: string | null }[];
  if (allDms.length === 0) return [];

  // Für Alt-DMs OHNE dm_key: die noch vorhandenen Mitgliedszeilen des Nutzers.
  const { data: myMem } = await service
    .from('chat_channel_members')
    .select('channel_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId);
  const memberOf = new Set((myMem ?? []).map((m) => m.channel_id));

  // Gesprächspartner aus dem dm_key ("<uidA>:<uidB>") ableiten; nur DMs, in denen
  // der Nutzer teilnimmt. Alt-DMs ohne dm_key über die Mitgliedszeile auflösen.
  const otherByChannel = new Map<string, string>();
  const legacyNeed: string[] = [];
  for (const d of allDms) {
    const parts = d.dm_key ? d.dm_key.split(':') : [];
    if (parts.length === 2 && parts.includes(userId)) {
      const other = parts.find((p) => p !== userId);
      if (other) otherByChannel.set(d.id, other);
    } else if (memberOf.has(d.id)) {
      legacyNeed.push(d.id);
    }
  }
  if (legacyNeed.length > 0) {
    const { data: members } = await service
      .from('chat_channel_members')
      .select('channel_id, user_id')
      .in('channel_id', legacyNeed);
    for (const m of members ?? []) {
      if (m.user_id !== userId) otherByChannel.set(m.channel_id, m.user_id);
    }
  }
  const dmIds = allDms.map((d) => d.id).filter((id) => otherByChannel.has(id));
  const otherIds = [...new Set(otherByChannel.values())];
  if (otherIds.length === 0) return [];

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, status, last_seen_at')
    .in('id', otherIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  const conversations = dmIds
    .map((id) => {
      const otherId = otherByChannel.get(id);
      if (!otherId) return null;
      const p = profileById.get(otherId);
      return {
        id,
        otherUserId: otherId,
        otherName: p?.full_name ?? 'Unbekannt',
        otherHasAvatar: Boolean(p?.avatar_url),
        otherStatus: livePresence(p?.status, p?.last_seen_at),
      };
    })
    .filter((d): d is DmConversation => d !== null);

  // Dedupe by conversation partner: legacy data can hold more than one DM channel
  // for the same pair (created before the dm_key guard), which showed a person
  // multiple times in the list. Keep one entry per person.
  const seen = new Set<string>();
  return conversations.filter((c) => {
    if (seen.has(c.otherUserId)) return false;
    seen.add(c.otherUserId);
    return true;
  });
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
    .select('id, full_name, avatar_url, status, last_seen_at')
    .in('id', ids);
  return (profiles ?? [])
    .map((p) => ({
      userId: p.id,
      name: p.full_name ?? 'Unbekannt',
      hasAvatar: Boolean(p.avatar_url),
      status: livePresence(p.status, p.last_seen_at),
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
    .select('id, name, description, is_private, kind, client_company_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!data) return null;
  // For client channels, label with the company name.
  let name = data.name;
  if (data.kind === 'client' && data.client_company_id) {
    const { data: company } = await createSupabaseServiceClient()
      .from('client_companies')
      .select('name')
      .eq('id', data.client_company_id)
      .maybeSingle();
    if (company?.name) name = company.name;
  }
  return {
    id: data.id,
    name,
    description: data.description,
    isPrivate: data.is_private,
    kind: data.kind,
  };
}

/**
 * Lists a channel's messages (oldest first). RLS restricts rows to agency staff
 * of the organization. Author names/avatars resolved via the service client.
 */
export async function listChannelMessages(
  channelId: string,
  currentUserId: string,
  limit = 20,
): Promise<ChannelMessage[]> {
  const service = createSupabaseServiceClient();
  const { data: chan } = await service
    .from('chat_channels')
    .select('kind, dm_key')
    .eq('id', channelId)
    .maybeSingle();
  const c = chan as { kind: string | null; dm_key: string | null } | null;

  // DMs: über die Teilnahme am dm_key autorisieren und per Service-Client lesen.
  // Der Empfang funktioniert dann auch, wenn die chat_channel_members-Zeile fehlt
  // (durch purge/Sweep aus 0140) oder die Org abweicht – RLS würde den DM sonst
  // komplett verstecken (Nachrichten „verschwinden"). Nur die beiden im dm_key
  // kodierten Teilnehmer dürfen lesen; die Route hat bereits Agentur-Zugriff
  // geprüft, Kundenkonten erreichen diesen Pfad nicht.
  if (c?.kind === 'dm') {
    const parts = (c.dm_key ?? '').split(':');
    if (!parts.includes(currentUserId)) return [];
    const { data } = await service
      .from('chat_channel_messages')
      .select(MESSAGE_COLUMNS)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return mapMessages(newestFirstToOldest(data), currentUserId);
  }

  // Alle anderen Kanäle: unveränderter RLS-Pfad (öffentliche/private/Kunden-Kanäle).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_channel_messages')
    .select(MESSAGE_COLUMNS)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return mapMessages(newestFirstToOldest(data), currentUserId);
}

/**
 * WICHTIG: Wir holen die NEUESTEN `limit` Nachrichten (absteigend) und drehen sie
 * dann für die Anzeige wieder aufsteigend. Würde man aufsteigend + limit lesen,
 * bekäme man die ÄLTESTEN `limit` – dann „verschwinden" neue Nachrichten, sobald
 * ein Chat mehr als `limit` Einträge hat (genau der Bug: ab Nachricht 201 kam bei
 * einem aktiven DM nichts mehr an, ohne Fehler).
 */
function newestFirstToOldest(rows: unknown): RawMessage[] {
  return ((rows ?? []) as RawMessage[]).slice().reverse();
}

export interface ChannelRead {
  userId: string;
  lastReadAt: string;
}

/**
 * Lesestand der ANDEREN Teilnehmer eines Kanals (für Lesebestätigungen). Der
 * eigene Lesestand ist per RLS sichtbar, fremde nicht – daher Service-Client,
 * aber erst nachdem die RLS-Sicht bestätigt hat, dass der Aufrufer den Kanal
 * überhaupt sehen darf. Liefert nur Nutzer, die den Kanal schon geöffnet haben.
 */
export async function listChannelReads(
  channelId: string,
  currentUserId: string,
): Promise<ChannelRead[]> {
  const service = createSupabaseServiceClient();
  const { data: chan } = await service
    .from('chat_channels')
    .select('kind, dm_key')
    .eq('id', channelId)
    .maybeSingle();
  const c = chan as { kind: string | null; dm_key: string | null } | null;
  if (!c) return [];

  if (c.kind === 'dm') {
    // DM: über Teilnahme autorisieren (robust gegen fehlende Mitgliedszeile).
    if (!(c.dm_key ?? '').split(':').includes(currentUserId)) return [];
  } else {
    // Nicht-DM: RLS-Sicht bestätigt, dass der Aufrufer den Kanal sehen darf.
    const supabase = await createSupabaseServerClient();
    const { data: vis } = await supabase
      .from('chat_channels')
      .select('id')
      .eq('id', channelId)
      .maybeSingle();
    if (!vis) return [];
  }

  const { data } = await service
    .from('chat_reads')
    .select('user_id, last_read_at')
    .eq('channel_id', channelId)
    .neq('user_id', currentUserId);
  return (data ?? []).map((r) => ({ userId: r.user_id, lastReadAt: r.last_read_at }));
}

/**
 * Full-text-ish search within a channel: matches message text OR file name
 * (case-insensitive). RLS restricts to channels the user may see. Newest first.
 */
export async function searchChannelMessages(
  channelId: string,
  currentUserId: string,
  query: string,
  limit = 50,
): Promise<ChannelMessage[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from('chat_channel_messages')
    .select(MESSAGE_COLUMNS)
    .eq('channel_id', channelId)
    .or(`body.ilike.${like},file_name.ilike.${like}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return mapMessages((data ?? []) as RawMessage[], currentUserId);
}

export interface StickerItem {
  id: string;
  name: string;
  url: string;
}

/** Lists the org's chat stickers (agency staff, RLS-scoped). */
export async function listStickers(orgId: string): Promise<StickerItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_stickers')
    .select('id, name, storage_path')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    url: `/api/chat-stickers/image?path=${encodeURIComponent(s.storage_path)}`,
  }));
}
