import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { QuarantineItem } from '@/features/inquiries/quarantine-types';

export type { QuarantineItem } from '@/features/inquiries/quarantine-types';
export { quarantineReasonLabel } from '@/features/inquiries/quarantine-types';

/**
 * Offene Quarantäne-Mails (nicht eindeutig zuordenbar). Service-Client; der
 * Aufrufer muss Super-Admin sein (siehe Page-Guard).
 */
export async function listQuarantine(): Promise<QuarantineItem[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('inbound_quarantine')
    .select('id, reason, from_address, to_addresses, subject, body, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((q) => ({
    id: q.id,
    reason: q.reason,
    fromAddress: q.from_address,
    toAddresses: q.to_addresses ?? [],
    subject: q.subject,
    body: q.body,
    createdAt: q.created_at,
  }));
}
