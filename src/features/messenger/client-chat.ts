import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { listChannelMessages, type ChannelMessage } from '@/features/messenger/queries';

/**
 * Returns the client chat channel id for a company, creating it on first use.
 * One channel per company (kind = 'client'). Service client – callers must have
 * verified access to the company first.
 */
export async function ensureClientChannel(
  orgId: string,
  clientCompanyId: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data: existing } = await service
    .from('chat_channels')
    .select('id')
    .eq('organization_id', orgId)
    .eq('kind', 'client')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: company } = await service
    .from('client_companies')
    .select('name')
    .eq('id', clientCompanyId)
    .maybeSingle();

  const { data: created } = await service
    .from('chat_channels')
    .insert({
      organization_id: orgId,
      name: company?.name ? `Kunde: ${company.name}` : 'Kundenchat',
      kind: 'client',
      client_company_id: clientCompanyId,
      is_private: false,
    })
    .select('id')
    .maybeSingle();
  return created?.id ?? null;
}

export interface ClientChatThread {
  channelId: string;
  messages: ChannelMessage[];
}

/** The logged-in client's chat thread with their account manager/agency. */
export async function getMyClientChannelThread(
  userId: string,
): Promise<ClientChatThread | null> {
  const company = await getMyClientCompany();
  if (!company) return null;
  const channelId = await ensureClientChannel(
    company.organizationId,
    company.clientCompanyId,
  );
  if (!channelId) return null;
  const messages = await listChannelMessages(channelId, userId);
  return { channelId, messages };
}
