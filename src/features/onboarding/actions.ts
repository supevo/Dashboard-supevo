'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { FILES_BUCKET } from '@/lib/files/storage';
import { encryptSecret } from '@/lib/crypto/secret-vault';
import {
  renderContractPdf,
  renderSepaPdf,
  renderSignedContractFromTemplate,
} from '@/features/onboarding/pdf';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const dataUrlPng = z
  .string()
  .regex(/^data:image\/png;base64,/, 'Bitte unterschreiben.')
  .max(2_000_000);

async function clientCtx() {
  const user = await requireUser();
  const company = await getMyClientCompany();
  if (!company) return null;
  return { user, company };
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unbekannt';
}

async function orgName(service: ReturnType<typeof createSupabaseServiceClient>, orgId: string) {
  const { data } = await service
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();
  return data?.name ?? 'Agentur';
}

async function upload(
  service: ReturnType<typeof createSupabaseServiceClient>,
  path: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const { error } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: true });
  return !error;
}

const contractSchema = z.object({
  signaturePng: dataUrlPng,
  signer: z.string().trim().min(2).max(120),
});

export async function signContractAction(input: unknown): Promise<ActionResult> {
  const parsed = contractSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte Name angeben und unterschreiben.');
  const ctx = await clientCtx();
  if (!ctx) return errorResult('Keine Berechtigung.');
  const { company } = ctx;

  const service = createSupabaseServiceClient();
  const signedAt = new Date().toISOString();
  const [{ data: clientCompany }, { data: ob }] = await Promise.all([
    service
      .from('client_companies')
      .select('name')
      .eq('id', company.clientCompanyId)
      .maybeSingle(),
    service
      .from('client_onboarding')
      .select('contract_template_path')
      .eq('client_company_id', company.clientCompanyId)
      .maybeSingle(),
  ]);

  const signParams = {
    agencyName: await orgName(service, company.organizationId),
    clientName: clientCompany?.name ?? 'Kunde',
    signer: parsed.data.signer,
    signedAt,
    ip: await clientIp(),
    signaturePng: parsed.data.signaturePng,
  };

  // When the agency deposited a contract PDF, sign that document (original pages
  // + appended signature page); otherwise fall back to the generated record.
  let templateBytes: Uint8Array | null = null;
  if (ob?.contract_template_path) {
    try {
      const { data } = await service.storage
        .from(FILES_BUCKET)
        .download(ob.contract_template_path);
      if (data) templateBytes = new Uint8Array(await data.arrayBuffer());
    } catch {
      templateBytes = null;
    }
  }

  const pdf = templateBytes
    ? await renderSignedContractFromTemplate({ ...signParams, templateBytes })
    : await renderContractPdf(signParams);

  const path = `org/${company.organizationId}/company/${company.clientCompanyId}/onboarding/contract-${randomUUID()}.pdf`;
  if (!(await upload(service, path, pdf))) return errorResult('PDF konnte nicht gespeichert werden.');

  const { error } = await service.from('client_onboarding').upsert(
    {
      organization_id: company.organizationId,
      client_company_id: company.clientCompanyId,
      contract_signed_at: signedAt,
      contract_signer: parsed.data.signer,
      contract_pdf_path: path,
      updated_at: signedAt,
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath('/portal');
  return successResult('Vertrag unterschrieben – danke!');
}

const sepaSchema = z.object({
  signaturePng: dataUrlPng,
  signer: z.string().trim().min(2).max(120),
  accountHolder: z.string().trim().min(2).max(140),
  iban: z.string().trim().min(15).max(40),
});

function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // mod-97 over the long number
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export async function signSepaAction(input: unknown): Promise<ActionResult> {
  const parsed = sepaSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte alle Felder ausfüllen und unterschreiben.');
  const ctx = await clientCtx();
  if (!ctx) return errorResult('Keine Berechtigung.');
  const { company } = ctx;

  const iban = normalizeIban(parsed.data.iban);
  if (!ibanValid(iban)) return errorResult('Bitte eine gültige IBAN angeben.');
  const last4 = iban.slice(-4);
  const masked = `${iban.slice(0, 4)} •••• •••• ${last4}`;

  const service = createSupabaseServiceClient();
  const signedAt = new Date().toISOString();
  const mandateRef = `SUPEVO-${company.clientCompanyId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const [{ data: clientCompany }, { data: entity }] = await Promise.all([
    service.from('client_companies').select('name').eq('id', company.clientCompanyId).maybeSingle(),
    service
      .from('billing_entities')
      .select('name, company_name, creditor_id')
      .eq('organization_id', company.organizationId)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const creditorName =
    entity?.company_name || entity?.name || (await orgName(service, company.organizationId));

  const pdf = await renderSepaPdf({
    creditorName,
    creditorId: entity?.creditor_id ?? '',
    clientName: clientCompany?.name ?? 'Kunde',
    accountHolder: parsed.data.accountHolder,
    ibanMasked: masked,
    mandateRef,
    signer: parsed.data.signer,
    signedAt,
    ip: await clientIp(),
    signaturePng: parsed.data.signaturePng,
  });

  const path = `org/${company.organizationId}/company/${company.clientCompanyId}/onboarding/sepa-${randomUUID()}.pdf`;
  if (!(await upload(service, path, pdf))) return errorResult('PDF konnte nicht gespeichert werden.');

  const { error } = await service.from('client_onboarding').upsert(
    {
      organization_id: company.organizationId,
      client_company_id: company.clientCompanyId,
      sepa_signed_at: signedAt,
      sepa_signer: parsed.data.signer,
      sepa_account_holder: parsed.data.accountHolder,
      sepa_iban_encrypted: encryptSecret(iban),
      sepa_iban_last4: last4,
      sepa_mandate_ref: mandateRef,
      sepa_pdf_path: path,
      updated_at: signedAt,
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath('/portal');
  return successResult('SEPA-Mandat erteilt – danke!');
}
