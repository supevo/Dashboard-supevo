import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';

export interface OnboardingStatus {
  clientCompanyId: string;
  organizationId: string;
  /** Whether the agency has started/configured onboarding for this client. */
  started: boolean;
  requiresContract: boolean;
  requiresSepa: boolean;
  requiresPlan: boolean;
  /** Agency-provided contract PDF the client reads before signing. */
  contractTemplatePath: string | null;
  contractTemplateName: string | null;
  contractSignedAt: string | null;
  contractPdfPath: string | null;
  sepaSignedAt: string | null;
  sepaPdfPath: string | null;
  sepaIbanLast4: string | null;
  sepaMandateRef: string | null;
  planAccepted: boolean;
  complete: boolean;
}

async function build(
  clientCompanyId: string,
  organizationId: string,
): Promise<OnboardingStatus> {
  const service = createSupabaseServiceClient();
  const [{ data: ob }, { data: plan }] = await Promise.all([
    service
      .from('client_onboarding')
      .select(
        'contract_signed_at, contract_pdf_path, sepa_signed_at, sepa_pdf_path, sepa_iban_last4, sepa_mandate_ref, started, requires_contract, requires_sepa, requires_plan, contract_template_path, contract_template_name',
      )
      .eq('client_company_id', clientCompanyId)
      .maybeSingle(),
    service
      .from('marketing_plans')
      .select('status')
      .eq('client_company_id', clientCompanyId)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle(),
  ]);

  const planAccepted = Boolean(plan);
  const contractSignedAt = ob?.contract_signed_at ?? null;
  const sepaSignedAt = ob?.sepa_signed_at ?? null;

  // Default to "everything required" when no row exists yet, but onboarding is
  // only shown to the client once the agency has explicitly started it.
  const requiresContract = ob?.requires_contract ?? true;
  const requiresSepa = ob?.requires_sepa ?? true;
  const requiresPlan = ob?.requires_plan ?? true;

  // Complete = every REQUIRED part done. A part that isn't required never blocks.
  const complete =
    (!requiresContract || Boolean(contractSignedAt)) &&
    (!requiresSepa || Boolean(sepaSignedAt)) &&
    (!requiresPlan || planAccepted);

  return {
    clientCompanyId,
    organizationId,
    started: ob?.started ?? false,
    requiresContract,
    requiresSepa,
    requiresPlan,
    contractTemplatePath: ob?.contract_template_path ?? null,
    contractTemplateName: ob?.contract_template_name ?? null,
    contractSignedAt,
    contractPdfPath: ob?.contract_pdf_path ?? null,
    sepaSignedAt,
    sepaPdfPath: ob?.sepa_pdf_path ?? null,
    sepaIbanLast4: ob?.sepa_iban_last4 ?? null,
    sepaMandateRef: ob?.sepa_mandate_ref ?? null,
    planAccepted,
    complete,
  };
}

/** Agency: onboarding status for a client (service client, agency-verified). */
export async function getOnboarding(
  clientCompanyId: string,
  organizationId: string,
): Promise<OnboardingStatus> {
  return build(clientCompanyId, organizationId);
}

/** Current client's onboarding status (for the portal stepper). */
export async function getMyOnboarding(): Promise<OnboardingStatus | null> {
  const company = await getMyClientCompany();
  if (!company) return null;
  return build(company.clientCompanyId, company.organizationId);
}
