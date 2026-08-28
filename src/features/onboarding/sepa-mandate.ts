import 'server-only';
import type { createSupabaseServiceClient } from '@/lib/supabase/service';

type Service = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Writes a signed SEPA mandate's details into the client's membership so the
 * direct-debit file (pain.008) can actually collect from this account.
 *
 * The onboarding record stores the IBAN encrypted; the debit XML reads the
 * plaintext `debtor_iban` on the membership. This bridges the two. Only the
 * IBAN (and payment method) are forced; mandate reference/date and billing name
 * are filled ONLY when still empty, so a value the agency set by hand wins.
 *
 * Returns 'no_membership' when the client has no membership row yet.
 */
export async function applyMandateToMembership(
  service: Service,
  params: {
    clientCompanyId: string;
    iban: string;
    mandateRef: string | null;
    mandateDate: string | null; // YYYY-MM-DD
    accountHolder: string | null;
  },
): Promise<'updated' | 'no_membership' | 'error'> {
  const { data: existing } = await service
    .from('client_memberships')
    .select('id, mandate_reference, mandate_date, billing_name')
    .eq('client_company_id', params.clientCompanyId)
    .maybeSingle();
  if (!existing) return 'no_membership';

  const patch: {
    debtor_iban: string;
    payment_method: 'sepa';
    mandate_reference?: string;
    mandate_date?: string;
    billing_name?: string;
  } = {
    debtor_iban: params.iban,
    payment_method: 'sepa',
  };
  if (!existing.mandate_reference && params.mandateRef) {
    patch.mandate_reference = params.mandateRef;
  }
  if (!existing.mandate_date && params.mandateDate) {
    patch.mandate_date = params.mandateDate;
  }
  if (!existing.billing_name && params.accountHolder) {
    patch.billing_name = params.accountHolder;
  }

  const { error } = await service
    .from('client_memberships')
    .update(patch)
    .eq('id', existing.id);
  return error ? 'error' : 'updated';
}
