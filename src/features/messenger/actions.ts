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

  // Service client for the write: a pure super_admin is not is_agency_staff(),
  // so the RLS insert with-check would reject them (channel access already
  // verified by the RLS read above).
  const service = createSupabaseServiceClient();
  const { error } = await service.from('chat_channel_messages').insert({
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

const createPollSchema = z.object({
  channelId: z.string().uuid(),
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(10),
  allowMultiple: z.boolean().optional(),
});

/**
 * Starts a poll (Abstimmung) in a channel: creates the poll row and posts it as
 * its own message so it appears inline in the stream.
 */
export async function createPollAction(input: {
  channelId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
}): Promise<ActionResult> {
  const parsed = createPollSchema.safeParse({
    channelId: input.channelId,
    question: input.question,
    // Drop empty option rows before validating.
    options: (input.options ?? []).map((o) => o.trim()).filter(Boolean),
    allowMultiple: input.allowMultiple,
  });
  if (!parsed.success) {
    return errorResult('Bitte Frage und mindestens zwei Optionen angeben.');
  }

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  // The RLS-scoped channel read is the access gate (returns the channel only if
  // the user may see it – incl. private membership and super_admin).
  const supabase = await createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('organization_id')
    .eq('id', parsed.data.channelId)
    .maybeSingle();
  if (!channel) return errorResult(de.errors.FORBIDDEN);

  // Writes go through the service client: a pure super_admin is not
  // is_agency_staff(), so the RLS insert with-check would reject them even
  // though they legitimately have agency access.
  const service = createSupabaseServiceClient();
  const { data: poll, error: pollErr } = await service
    .from('chat_polls')
    .insert({
      channel_id: parsed.data.channelId,
      organization_id: channel.organization_id,
      question: parsed.data.question,
      options: parsed.data.options,
      allow_multiple: parsed.data.allowMultiple ?? false,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();
  if (pollErr || !poll) return errorResult(de.errors.FORBIDDEN);

  const { error: msgErr } = await service.from('chat_channel_messages').insert({
    channel_id: parsed.data.channelId,
    organization_id: channel.organization_id,
    author_id: user.id,
    body: null,
    poll_id: poll.id,
  });
  if (msgErr) return errorResult(de.errors.FORBIDDEN);

  return successResult('Umfrage gestartet.');
}

/**
 * Casts or retracts a vote on a poll option (toggle). For single-choice polls,
 * voting a new option replaces the previous one. Closed polls reject votes.
 */
export async function votePollAction(
  pollId: string,
  optionIndex: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(pollId).success) return { ok: false };
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return { ok: false };

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false };

  // RLS read is the access gate; votes are written with the service client so a
  // super_admin (not is_agency_staff()) can vote too.
  const supabase = await createSupabaseServerClient();
  const { data: poll } = await supabase
    .from('chat_polls')
    .select('id, organization_id, options, allow_multiple, closed')
    .eq('id', pollId)
    .maybeSingle();
  if (!poll) return { ok: false };
  if (poll.closed) return { ok: false, error: 'Diese Umfrage ist beendet.' };
  if (optionIndex >= (poll.options?.length ?? 0)) return { ok: false };

  const service = createSupabaseServiceClient();
  // Existing vote for this exact option → toggle it off.
  const { data: existing } = await service
    .from('chat_poll_votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('user_id', user.id)
    .eq('option_index', optionIndex)
    .maybeSingle();
  if (existing) {
    await service.from('chat_poll_votes').delete().eq('id', existing.id);
    return { ok: true };
  }

  // Single-choice: clear the user's other vote(s) first.
  if (!poll.allow_multiple) {
    await service
      .from('chat_poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', user.id);
  }

  const { error } = await service.from('chat_poll_votes').insert({
    poll_id: pollId,
    organization_id: poll.organization_id,
    option_index: optionIndex,
    user_id: user.id,
  });
  return { ok: !error };
}

/** Closes a poll so no further votes can be cast. Creator (or super admin). */
export async function closePollAction(pollId: string): Promise<{ ok: boolean }> {
  if (!z.string().uuid().safeParse(pollId).success) return { ok: false };
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('chat_polls')
    .update({ closed: true })
    .eq('id', pollId);
  return { ok: !error };
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

  const service = createSupabaseServiceClient();
  const { error } = await service.from('chat_channel_messages').insert({
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

const FILE_TTL_DAYS = 60;

/**
 * Toggles the "important" flag on a chat file. keep=true → the file is kept
 * permanently (no auto-delete); keep=false → it expires again 60 days from now.
 * Agency staff of the file's org only.
 */
export async function toggleChatFileKeepAction(
  messageId: string,
  keep: boolean,
): Promise<{ ok: boolean }> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false };
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false };

  const service = createSupabaseServiceClient();
  const { data: msg } = await service
    .from('chat_channel_messages')
    .select('organization_id, file_path')
    .eq('id', messageId)
    .maybeSingle();
  if (
    !msg ||
    !msg.file_path ||
    !user.memberships.some((m) => m.organizationId === msg.organization_id)
  ) {
    return { ok: false };
  }

  const expires = keep
    ? null
    : new Date(Date.now() + FILE_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await service
    .from('chat_channel_messages')
    .update({ file_keep: keep, file_expires_at: expires })
    .eq('id', messageId);
  return { ok: !error };
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
