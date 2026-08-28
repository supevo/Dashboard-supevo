'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { decryptSecret } from '@/lib/crypto/secret-vault';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { applyMandateToMembership } from '@/features/onboarding/sepa-mandate';

const idSchema = z.string().uuid();

/** Reads the onboarding row (service client – RLS-bypassing, so callers MUST
 *  authorize against the returned organization_id before using the data). */
async function loadOnboarding(clientCompanyId: string) {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('client_onboarding')
    .select(
      'organization_id, sepa_iban_encrypted, sepa_account_holder, sepa_mandate_ref, sepa_signed_at',
    )
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return data;
}

export type RevealIbanResult =
  | { ok: true; iban: string; holder: string | null }
  | { ok: false; error: string };

/**
 * Decrypts and returns the client-signed SEPA IBAN for an agency admin. The
 * IBAN is stored encrypted at rest; only org admins may reveal it. Access is
 * noted in the server log.
 */
export async function revealSignedIbanAction(
  clientCompanyId: string,
): Promise<RevealIbanResult> {
  const parsed = idSchema.safeParse(clientCompanyId);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };

  const user = await requireUser();
  const ob = await loadOnboarding(parsed.data);
  if (!ob) return { ok: false, error: de.errors.NOT_FOUND };
  authorize(user, { type: 'clientCompany.manage', orgId: ob.organization_id });

  if (!ob.sepa_iban_encrypted) {
    return { ok: false, error: 'Für diesen Kunden ist keine signierte IBAN hinterlegt.' };
  }
  const iban = decryptSecret(ob.sepa_iban_encrypted);
  if (iban === null) return { ok: false, error: 'Entschlüsselung fehlgeschlagen.' };

  logger.info('sepa.iban.revealed', {
    actorId: user.id,
    clientCompanyId: parsed.data,
  });
  return { ok: true, iban, holder: ob.sepa_account_holder ?? null };
}

/**
 * Copies the client-signed IBAN (+ mandate reference/date, account holder) into
 * the client's membership so the SEPA debit file can collect from it. Used to
 * back-fill clients who signed before this was automatic.
 */
export async function applySignedIbanToMembershipAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(clientCompanyId);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const ob = await loadOnboarding(parsed.data);
  if (!ob) return errorResult(de.errors.NOT_FOUND);
  authorize(user, { type: 'clientCompany.manage', orgId: ob.organization_id });

  if (!ob.sepa_iban_encrypted) {
    return errorResult('Für diesen Kunden ist keine signierte IBAN hinterlegt.');
  }
  const iban = decryptSecret(ob.sepa_iban_encrypted);
  if (iban === null) return errorResult('Entschlüsselung fehlgeschlagen.');

  const service = createSupabaseServiceClient();
  const result = await applyMandateToMembership(service, {
    clientCompanyId: parsed.data,
    iban,
    mandateRef: ob.sepa_mandate_ref ?? null,
    mandateDate: ob.sepa_signed_at ? ob.sepa_signed_at.slice(0, 10) : null,
    accountHolder: ob.sepa_account_holder ?? null,
  });
  if (result === 'no_membership') {
    return errorResult('Bitte zuerst die Mitgliedschaft für diesen Kunden anlegen.');
  }
  if (result === 'error') return errorResult(de.errors.INTERNAL);

  logger.info('sepa.iban.applied_to_membership', {
    actorId: user.id,
    clientCompanyId: parsed.data,
  });
  revalidatePath(`/app/clients/${parsed.data}`);
  return successResult(`IBAN ins Einzugsfeld übernommen (••••${iban.slice(-4)}).`);
}
