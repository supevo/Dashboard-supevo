'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
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
});

/** Creates a new channel in the current agency organization. */
export async function createChannelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const name = normalizeChannelName(parsed.data.name);
  if (!name) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('chat_channels').insert({
    organization_id: orgId,
    name,
    description: parsed.data.description ? parsed.data.description : null,
    created_by: user.id,
  });
  if (error) {
    // 23505 = unique violation (channel name already exists).
    if (error.code === '23505') return errorResult('Ein Kanal mit diesem Namen existiert bereits.');
    return errorResult(de.errors.FORBIDDEN);
  }

  revalidatePath('/app/chat');
  return successResult('Kanal erstellt.');
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

  return successResult('');
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
