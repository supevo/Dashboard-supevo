'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/** Normalizes a channel name to lowercase, dashed, no spaces (Slack-style). */
function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  isPrivate: z.string().optional(),
  memberIds: z.string().optional(),
});

/** Creates a new channel (public, or private with an explicit member list). */
export async function createChannelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    isPrivate: formData.get('isPrivate') ?? undefined,
    memberIds: formData.get('memberIds') ?? undefined,
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const name = normalizeChannelName(parsed.data.name);
  if (!name) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const isPrivate = parsed.data.isPrivate === 'on' || parsed.data.isPrivate === 'true';

  // Public channel: plain RLS-guarded insert.
  if (!isPrivate) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('chat_channels').insert({
      organization_id: orgId,
      name,
      description: parsed.data.description ? parsed.data.description : null,
      created_by: user.id,
    });
    if (error) {
      if (error.code === '23505')
        return errorResult('Ein Kanal mit diesem Namen existiert bereits.');
      return errorResult(de.errors.FORBIDDEN);
    }
    revalidatePath('/app/chat');
    return successResult('Kanal erstellt.');
  }

  // Private channel: create via service role, then add creator + selected members.
  let memberIds: string[] = [];
  try {
    const raw = parsed.data.memberIds ? JSON.parse(parsed.data.memberIds) : [];
    if (Array.isArray(raw)) memberIds = raw.filter((v): v is string => typeof v === 'string');
  } catch {
    memberIds = [];
  }

  const service = createSupabaseServiceClient();
  const { data: created, error } = await service
    .from('chat_channels')
    .insert({
      organization_id: orgId,
      name,
      description: parsed.data.description ? parsed.data.description : null,
      is_private: true,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();
  if (error || !created) {
    if (error?.code === '23505')
      return errorResult('Ein Kanal mit diesem Namen existiert bereits.');
    return errorResult(de.errors.FORBIDDEN);
  }

  const members = [...new Set([user.id, ...memberIds])].map((uid) => ({
    channel_id: created.id,
    organization_id: orgId,
    user_id: uid,
  }));
  await service.from('chat_channel_members').insert(members);

  revalidatePath('/app/chat');
  return successResult('Privater Kanal erstellt.');
}

/**
 * Opens (or creates) the 1:1 direct-message conversation between the current
 * user and another org member. Returns the channel id for the client to select.
 */
export async function openDmAction(
  otherUserId: string,
): Promise<{ channelId: string } | { error: string }> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { error: de.errors.FORBIDDEN };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { error: de.errors.FORBIDDEN };
  if (otherUserId === user.id) return { error: de.errors.VALIDATION };

  const service = createSupabaseServiceClient();

  // Other user must be an active agency member of the same org.
  const { data: membership } = await service
    .from('memberships')
    .select('user_id, role, status')
    .eq('organization_id', orgId)
    .eq('user_id', otherUserId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership || membership.role === 'client') return { error: de.errors.FORBIDDEN };

  const dmKey = [user.id, otherUserId].sort().join(':');

  const { data: existing } = await service
    .from('chat_channels')
    .select('id')
    .eq('dm_key', dmKey)
    .maybeSingle();
  if (existing) return { channelId: existing.id };

  const { data: created, error } = await service
    .from('chat_channels')
    .insert({
      organization_id: orgId,
      name: '',
      kind: 'dm',
      is_private: true,
      dm_key: dmKey,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();
  if (error || !created) return { error: de.errors.INTERNAL };

  await service.from('chat_channel_members').insert([
    { channel_id: created.id, organization_id: orgId, user_id: user.id },
    { channel_id: created.id, organization_id: orgId, user_id: otherUserId },
  ]);

  return { channelId: created.id };
}

const sendSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

/** Posts a message to a channel. */
export async function sendChannelMessageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = sendSchema.safeParse({
    channelId: formData.get('channelId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  // Resolve the channel's org (RLS-scoped read) so the message carries it.
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', parsed.data.channelId)
    .maybeSingle();
  if (!channel) return errorResult(de.errors.FORBIDDEN);

  const { error } = await supabase.from('chat_channel_messages').insert({
    channel_id: parsed.data.channelId,
    organization_id: channel.organization_id,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  await notifyMentions(
    channel.organization_id,
    parsed.data.channelId,
    parsed.data.body,
    user.id,
    user.fullName ?? user.email,
  );

  return successResult('');
}

/** Deletes a chat sticker (and its stored image). Agency staff of the org. */
export async function deleteStickerAction(stickerId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: sticker } = await supabase
    .from('chat_stickers')
    .select('storage_path')
    .eq('id', stickerId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!sticker) return { ok: false };

  const { error } = await supabase.from('chat_stickers').delete().eq('id', stickerId);
  if (error) return { ok: false };

  try {
    const { FILES_BUCKET } = await import('@/lib/files/storage');
    await createSupabaseServiceClient().storage
      .from(FILES_BUCKET)
      .remove([sticker.storage_path]);
  } catch {
    /* best-effort */
  }
  revalidatePath('/app/settings');
  return { ok: true };
}

/** Sends a sticker (team image) into a channel/DM as its own message. */
export async function sendStickerAction(
  channelId: string,
  stickerId: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return { ok: false };

  // The sticker must belong to the channel's organization.
  const { data: sticker } = await supabase
    .from('chat_stickers')
    .select('storage_path')
    .eq('id', stickerId)
    .eq('organization_id', channel.organization_id)
    .maybeSingle();
  if (!sticker) return { ok: false };

  const { error } = await supabase.from('chat_channel_messages').insert({
    channel_id: channelId,
    organization_id: channel.organization_id,
    author_id: user.id,
    body: null,
    sticker_path: sticker.storage_path,
  });
  if (error) return { ok: false };
  return { ok: true };
}

/**
 * Parses @mentions from a message and notifies matched org members. Matching is
 * best-effort against first names and full names (case-insensitive). Uses the
 * existing 'comment_mention' notification type.
 */
async function notifyMentions(
  orgId: string,
  channelId: string,
  body: string,
  authorId: string,
  authorName: string,
): Promise<void> {
  const tokens = [...body.matchAll(/@([\p{L}]+)/gu)]
    .map((m) => (m[1] ?? '').toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return;

  const service = createSupabaseServiceClient();
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staffIds = (memberships ?? [])
    .filter((m) => m.role !== 'client')
    .map((m) => m.user_id)
    .filter((id) => id !== authorId);
  if (staffIds.length === 0) return;

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name')
    .in('id', staffIds);

  const matched = new Set<string>();
  for (const p of profiles ?? []) {
    const full = (p.full_name ?? '').toLowerCase();
    if (!full) continue;
    const first = full.split(/\s+/)[0] ?? '';
    if (tokens.some((t) => t === first || full.split(/\s+/).includes(t))) {
      matched.add(p.id);
    }
  }
  if (matched.size === 0) return;

  await createNotifications(
    [...matched].map((recipientId) => ({
      organizationId: orgId,
      recipientId,
      type: 'comment_mention' as const,
      title: `${authorName} hat dich im Chat erwähnt`,
      body: body.slice(0, 200),
      entityType: 'chat',
      entityId: channelId,
    })),
    authorId,
  );
}

/** Marks a channel as read up to now for the current user. */
export async function markChannelRead(channelId: string): Promise<void> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return;
  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return;
  await supabase.from('chat_reads').upsert(
    {
      channel_id: channelId,
      user_id: user.id,
      organization_id: channel.organization_id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'channel_id,user_id' },
  );
}

/** Deletes a channel (creator or admin). */
export async function deleteChannelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('channelId'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('chat_channels').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/chat');
  return successResult('Kanal gelöscht.');
}
