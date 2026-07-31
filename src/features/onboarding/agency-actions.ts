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
