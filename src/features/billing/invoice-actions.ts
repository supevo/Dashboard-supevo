'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { getBillingSettings } from '@/features/billing/queries';
import { getClientMembership } from '@/features/billing/membership';
import { createDraftInvoice, assignInvoiceNumber } from '@/features/billing/invoice-service';
import { renderInvoicePdf } from '@/features/billing/invoice-pdf';
import { FILES_BUCKET } from '@/lib/files/storage';
import type { Database } from '@/lib/database.types';

const idSchema = z.object({ invoiceId: z.string().uuid() });
const clientSchema = z.object({ clientCompanyId: z.string().uuid() });

/** Creates a draft invoice for the client's active membership (current period). */
export async function createDraftInvoiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = clientSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const membership = await getClientMembership(clientCompanyId);
  if (!membership) return errorResult('Für diesen Kunden ist keine Mitgliedschaft eingerichtet.');

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: membership.organization_id });

  const settings = await getBillingSettings(membership.organization_id);
  const result = await createDraftInvoice({
    supabase,
    orgId: membership.organization_id,
    clientCompanyId,
    membership,
    settings,
    createdBy: user.id,
  });
  if ('error' in result) {
    logger.warn('invoice.draft.failed', { error: result.error });
    return errorResult(de.errors.INTERNAL);
  }

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Rechnungsentwurf erstellt.');
}

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type LoadedInvoice =
  | { ok: false; result: ActionResult }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      invoice: InvoiceRow;
      user: Awaited<ReturnType<typeof requireUser>>;
    };

/** Loads an invoice's org, verifying the caller is org admin. */
async function loadInvoiceForManage(invoiceId: string): Promise<LoadedInvoice> {
  const supabase = await createSupabaseServerClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, result: errorResult(de.errors.NOT_FOUND) };
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: invoice.organization_id });
  return { ok: true, supabase, invoice, user };
}

/** Finalizes a draft: assigns the number, renders + stores the PDF. */
export async function finalizeInvoiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const loaded = await loadInvoiceForManage(parsed.data.invoiceId);
  if (!loaded.ok) return loaded.result;
  const { supabase, invoice, user } = loaded;
  if (invoice.status !== 'draft') {
    return errorResult('Nur Entwürfe können finalisiert werden.');
  }

  const settings = await getBillingSettings(invoice.organization_id);
  if (!settings?.company_name || !settings.iban) {
    return errorResult(
      'Bitte zuerst die Firmen- und Bankdaten unter „Firma & Rechnung" ausfüllen.',
    );
  }

  const numberResult = await assignInvoiceNumber(supabase, invoice.organization_id);
  if ('error' in numberResult) return errorResult(de.errors.INTERNAL);

  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('position', { ascending: true });
  const membership = await getClientMembership(invoice.client_company_id);

  const finalized = {
    ...invoice,
    invoice_number: numberResult.number,
    issue_date: today,
    due_date: today,
    status: 'finalized' as const,
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderInvoicePdf({
      invoice: finalized,
      items: items ?? [],
      settings,
      membership,
    });
  } catch (e) {
    logger.error('invoice.pdf.failed', { error: (e as Error).message });
    return errorResult('Das PDF konnte nicht erzeugt werden.');
  }

  const path = `org/${invoice.organization_id}/invoices/${invoice.id}.pdf`;
  const { error: upErr } = await createSupabaseServiceClient()
    .storage.from(FILES_BUCKET)
    .upload(path, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    logger.error('invoice.pdf.upload_failed', { error: upErr.message });
    return errorResult('Das PDF konnte nicht gespeichert werden.');
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      invoice_number: numberResult.number,
      issue_date: today,
      due_date: today,
      status: 'finalized',
      pdf_path: path,
    })
    .eq('id', invoice.id);
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: invoice.organization_id,
    action: 'update',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: { number: numberResult.number, event: 'finalize' },
  });

  revalidatePath(`/app/clients/${invoice.client_company_id}`);
  return successResult(`Rechnung ${numberResult.number} finalisiert.`);
}

async function setInvoiceStatus(
  invoiceId: string,
  status: 'sent' | 'paid' | 'void',
  extra: Record<string, unknown> = {},
): Promise<ActionResult> {
  const loaded = await loadInvoiceForManage(invoiceId);
  if (!loaded.ok) return loaded.result;
  const { supabase, invoice } = loaded;

  const { error } = await supabase
    .from('invoices')
    .update({ status, ...extra })
    .eq('id', invoiceId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${invoice.client_company_id}`);
  return successResult('Status aktualisiert.');
}

export async function markInvoiceSentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  return setInvoiceStatus(parsed.data.invoiceId, 'sent', {
    sent_at: new Date().toISOString(),
  });
}

export async function markInvoicePaidAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  return setInvoiceStatus(parsed.data.invoiceId, 'paid', {
    paid_at: new Date().toISOString(),
  });
}

export async function voidInvoiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  return setInvoiceStatus(parsed.data.invoiceId, 'void');
}

/** Single dispatcher so one row form can drive several operations via `op`. */
export async function invoiceOpAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  switch (formData.get('op')) {
    case 'finalize':
      return finalizeInvoiceAction(prev, formData);
    case 'sent':
      return markInvoiceSentAction(prev, formData);
    case 'paid':
      return markInvoicePaidAction(prev, formData);
    case 'void':
      return voidInvoiceAction(prev, formData);
    default:
      return errorResult(de.errors.VALIDATION);
  }
}
