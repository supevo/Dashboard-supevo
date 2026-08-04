'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { createNotifications } from '@/features/notifications/create';

const schema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

type Result = { ok: true } | { ok: false; error: string };

/**
 * Sends a message in a client chat channel. Works for both the client and the
 * agency: access is gated by an RLS read of the channel (the client can only see
 * their own client channel; agency staff see their org's), then the message is
 * written with the service client. Notifies the other side.
 */
export async function sendClientChatMessageAction(
  channelId: string,
  body: string,
): Promise<Result> {
  const parsed = schema.safeParse({ channelId, body });
  if (!parsed.success) return { ok: false, error: 'Ungültige Nachricht.' };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Nicht angemeldet.' };

  // Access gate: RLS returns the channel only to its participants.
  const rls = await createSupabaseServerClient();
  const { data: channel } = await rls
    .from('chat_channels')
    .select('id, organization_id, client_company_id, kind')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel || channel.kind !== 'client' || !channel.client_company_id) {
    return { ok: false, error: 'Chat nicht gefunden.' };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.from('chat_channel_messages').insert({
    channel_id: channelId,
    organization_id: channel.organization_id,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: 'Senden fehlgeschlagen.' };

  // Notify the other side (best-effort).
  const { data: contacts } = await service
    .from('client_contacts')
    .select('user_id')
    .eq('client_company_id', channel.client_company_id);
  const contactIds = new Set((contacts ?? []).map((c) => c.user_id));
  const senderIsClient = contactIds.has(user.id);

  let recipients: string[] = [];
  if (senderIsClient) {
    // Client → account manager (fallback: none).
    const { data: company } = await service
      .from('client_companies')
      .select('account_manager_id')
      .eq('id', channel.client_company_id)
      .maybeSingle();
    if (company?.account_manager_id) recipients = [company.account_manager_id];
  } else {
    // Agency → the client's contacts.
    recipients = [...contactIds];
  }
  recipients = recipients.filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: channel.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: '💬 Neue Chat-Nachricht',
        body: parsed.data.body.slice(0, 140),
        entityType: 'chat',
        entityId: channelId,
      })),
      user.id,
    );
  }

  return { ok: true };
}
