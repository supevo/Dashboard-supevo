'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/**
 * Verifies the current user is agency staff of the organization that owns the
 * given client company. Returns the org id, or null when not authorized.
 */
async function authorizeClient(clientCompanyId: string): Promise<string | null> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) return null;
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return null;
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return null;

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) return null;
  return orgId;
}

const configureSchema = z.object({
  clientCompanyId: z.string().uuid(),
  start: z.boolean(),
  requiresContract: z.boolean(),
  requiresSepa: z.boolean(),
  requiresPlan: z.boolean(),
});

/**
 * Agency click-funnel result: starts (or stops) onboarding for a client and
 * records which parts apply. The client only sees the enabled steps in the
 * portal, and only once `start` is true.
 */
export async function configureOnboardingAction(input: {
  clientCompanyId: string;
  start: boolean;
  requiresContract: boolean;
  requiresSepa: boolean;
  requiresPlan: boolean;
}): Promise<ActionResult> {
  const parsed = configureSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Eingabe.');
  const orgId = await authorizeClient(parsed.data.clientCompanyId);
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const { error } = await service.from('client_onboarding').upsert(
    {
      organization_id: orgId,
      client_company_id: parsed.data.clientCompanyId,
      started: parsed.data.start,
      requires_contract: parsed.data.requiresContract,
      requires_sepa: parsed.data.requiresSepa,
      requires_plan: parsed.data.requiresPlan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  revalidatePath('/portal');
  return parsed.data.start
    ? successResult('Onboarding eingerichtet.')
    : successResult('Onboarding deaktiviert.');
}

const templateSchema = z.object({
  clientCompanyId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Authorizes + builds a direct-to-storage upload target for a contract PDF. */
export async function createContractTemplateUpload(input: {
  clientCompanyId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<
  | { ok: true; path: string; token: string; storagePath: string }
  | { ok: false; error: string }
> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Ungültige Datei.' };
  if (parsed.data.mimeType !== 'application/pdf')
    return { ok: false, error: 'Bitte eine PDF-Datei hochladen.' };
  if (parsed.data.sizeBytes > MAX_TEMPLATE_BYTES)
    return { ok: false, error: 'Die Datei ist zu groß (max. 20 MB).' };

  const orgId = await authorizeClient(parsed.data.clientCompanyId);
  if (!orgId) return { ok: false, error: 'Keine Berechtigung.' };

  const { randomUUID } = await import('node:crypto');
  const storagePath = `org/${orgId}/company/${parsed.data.clientCompanyId}/onboarding/contract-template-${randomUUID()}.pdf`;

  const { createSignedUploadTarget } = await import('@/lib/files/storage');
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const target = await createSignedUploadTarget(supabase, storagePath);
  if (!target) return { ok: false, error: 'Upload konnte nicht vorbereitet werden.' };

  return { ok: true, path: target.path, token: target.token, storagePath };
}

/** Stable mandate reference for a client (reused across preview + signing). */
function mandateRefFor(clientCompanyId: string): string {
  return `SUPEVO-${clientCompanyId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Generates (or regenerates) the SEPA mandate preview PDF for the agency to
 * review before releasing it to the client. The debtor fields stay blank – the
 * client fills IBAN + signature when signing.
 */
export async function generateSepaPreviewAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  const orgId = await authorizeClient(clientCompanyId);
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const [{ data: company }, { data: entity }, { data: existing }] = await Promise.all([
    service.from('client_companies').select('name').eq('id', clientCompanyId).maybeSingle(),
    service
      .from('billing_entities')
      .select('name, company_name, creditor_id')
      .eq('organization_id', orgId)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('client_onboarding')
      .select('sepa_mandate_ref')
      .eq('client_company_id', clientCompanyId)
      .maybeSingle(),
  ]);

  const creditorName = entity?.company_name || entity?.name || 'Agentur';
  const mandateRef = existing?.sepa_mandate_ref || mandateRefFor(clientCompanyId);

  const { renderSepaPreviewPdf } = await import('@/features/onboarding/pdf');
  const pdf = await renderSepaPreviewPdf({
    creditorName,
    creditorId: entity?.creditor_id ?? '',
    clientName: company?.name ?? 'Kunde',
    mandateRef,
  });

  const { randomUUID } = await import('node:crypto');
  const { FILES_BUCKET } = await import('@/lib/files/storage');
  const path = `org/${orgId}/company/${clientCompanyId}/onboarding/sepa-preview-${randomUUID()}.pdf`;
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true });
  if (upErr) return errorResult('PDF konnte nicht erstellt werden.');

  const { error } = await service.from('client_onboarding').upsert(
    {
      organization_id: orgId,
      client_company_id: clientCompanyId,
      sepa_preview_path: path,
      sepa_mandate_ref: mandateRef,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('SEPA-Vorschau erstellt.');
}

/**
 * Releases the reviewed SEPA mandate to the client: the client then sees the
 * SEPA step in the portal. Notifies the client's contacts.
 */
export async function releaseSepaAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  const orgId = await authorizeClient(clientCompanyId);
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const { data: ob } = await service
    .from('client_onboarding')
    .select('sepa_preview_path')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!ob?.sepa_preview_path)
    return errorResult('Bitte zuerst eine Vorschau erstellen.');

  const { error } = await service
    .from('client_onboarding')
    .update({
      sepa_released: true,
      sepa_released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult('Speichern fehlgeschlagen.');

  // Notify the client's contacts that the mandate is ready to sign.
  const { data: contacts } = await service
    .from('client_contacts')
    .select('user_id')
    .eq('client_company_id', clientCompanyId);
  const recipientIds = [...new Set((contacts ?? []).map((c) => c.user_id))];
  if (recipientIds.length > 0) {
    const { createNotifications } = await import('@/features/notifications/create');
    await createNotifications(
      recipientIds.map((recipientId) => ({
        organizationId: orgId,
        recipientId,
        type: 'onboarding' as const,
        title: 'SEPA-Mandat bereit',
        body: 'Bitte erteilt uns das SEPA-Lastschriftmandat im Portal.',
        entityType: 'onboarding',
        entityId: clientCompanyId,
      })),
    );
  }

  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/portal');
  return successResult('SEPA-Mandat an den Kunden gesendet.');
}

const finalizeTemplateSchema = z.object({
  clientCompanyId: z.string().uuid(),
  storagePath: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
});

/** Records the uploaded contract PDF on the client's onboarding row. */
export async function finalizeContractTemplate(input: {
  clientCompanyId: string;
  storagePath: string;
  fileName: string;
}): Promise<ActionResult> {
  const parsed = finalizeTemplateSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Eingabe.');
  const orgId = await authorizeClient(parsed.data.clientCompanyId);
  if (!orgId) return errorResult('Keine Berechtigung.');

  // The stored path must live under this client's onboarding folder.
  const prefix = `org/${orgId}/company/${parsed.data.clientCompanyId}/onboarding/`;
  if (!parsed.data.storagePath.startsWith(prefix))
    return errorResult('Ungültiger Pfad.');

  const service = createSupabaseServiceClient();
  const { error } = await service.from('client_onboarding').upsert(
    {
      organization_id: orgId,
      client_company_id: parsed.data.clientCompanyId,
      contract_template_path: parsed.data.storagePath,
      contract_template_name: parsed.data.fileName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  revalidatePath('/portal');
  return successResult('Vertrag hinterlegt.');
}
