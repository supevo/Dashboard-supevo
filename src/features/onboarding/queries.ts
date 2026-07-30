import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';

export interface OnboardingStatus {
  clientCompanyId: string;
  organizationId: string;
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
        'contract_signed_at, contract_pdf_path, sepa_signed_at, sepa_pdf_path, sepa_iban_last4, sepa_mandate_ref',
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

  return {
    clientCompanyId,
    organizationId,
    contractSignedAt,
    contractPdfPath: ob?.contract_pdf_path ?? null,
    sepaSignedAt,
    sepaPdfPath: ob?.sepa_pdf_path ?? null,
    sepaIbanLast4: ob?.sepa_iban_last4 ?? null,
    sepaMandateRef: ob?.sepa_mandate_ref ?? null,
    planAccepted,
    complete: Boolean(contractSignedAt && sepaSignedAt && planAccepted),
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
