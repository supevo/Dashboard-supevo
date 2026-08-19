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
import { getClientMembership } from '@/features/billing/membership';
import {
  createDraftInvoice,
  assignInvoiceNumber,
  resolveClientEntity,
  resolveInvoiceEntity,
} from '@/features/billing/invoice-service';
import { renderInvoicePdf } from '@/features/billing/invoice-pdf';
import { getOrgBranding } from '@/features/branding/queries';
import { FILES_BUCKET } from '@/lib/files/storage';
import { sendEmail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { formatEuroCents } from '@/lib/money';
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

  const entity = await resolveClientEntity(
    supabase,
    membership.organization_id,
    clientCompanyId,
  );
  const result = await createDraftInvoice({
    supabase,
    orgId: membership.organization_id,
    clientCompanyId,
    membership,
    settings: entity,
    billingEntityId: entity?.id ?? null,
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

/**
 * Renders the invoice PDF and stores it at its canonical path (overwriting any
 * prior version). Shared by finalize and „PDF neu generieren".
 */
async function renderAndStoreInvoicePdf(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoice: InvoiceRow,
  entity: NonNullable<Awaited<ReturnType<typeof resolveInvoiceEntity>>>,
): Promise<{ ok: true; path: string } | { ok: false; result: ActionResult }> {
  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('position', { ascending: true });
  const membership = await getClientMembership(invoice.client_company_id);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderInvoicePdf({
      invoice,
      items: items ?? [],
      settings: entity,
      membership,
      logoDark: (await getOrgBranding(invoice.organization_id)).logoDark,
    });
  } catch (e) {
    logger.error('invoice.pdf.failed', { error: (e as Error).message });
    return { ok: false, result: errorResult('Das PDF konnte nicht erzeugt werden.') };
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
    return { ok: false, result: errorResult('Das PDF konnte nicht gespeichert werden.') };
  }
  return { ok: true, path };
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

  const entity = await resolveInvoiceEntity(supabase, invoice);
  if (!entity?.company_name || !entity.iban) {
    return errorResult(
      'Bitte zuerst die Firmen- und Bankdaten des Rechnungsstellers ausfüllen.',
    );
  }

  const numberResult = await assignInvoiceNumber(supabase, entity.id);
  if ('error' in numberResult) return errorResult(de.errors.INTERNAL);

  const today = new Date().toISOString().slice(0, 10);
  const finalized = {
    ...invoice,
    invoice_number: numberResult.number,
    issue_date: today,
    due_date: today,
    status: 'finalized' as const,
  };

  const stored = await renderAndStoreInvoicePdf(supabase, finalized, entity);
  if (!stored.ok) return stored.result;
  const path = stored.path;

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

/**
 * Storniert eine Rechnung. Ein Entwurf (ohne Nummer) wird einfach verworfen;
 * eine nummerierte Rechnung bleibt als Beleg erhalten (Nummer + PDF), wird aber
 * auf „void" gesetzt und der Grund/Zeitpunkt/Bearbeiter festgehalten. Für
 * nummerierte Rechnungen ist ein Grund Pflicht – Nachvollziehbarkeit.
 */
export async function voidInvoiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      invoiceId: z.string().uuid(),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse({
      invoiceId: formData.get('invoiceId'),
      reason: formData.get('reason') ?? undefined,
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const loaded = await loadInvoiceForManage(parsed.data.invoiceId);
  if (!loaded.ok) return loaded.result;
  const { supabase, invoice, user } = loaded;

  if (invoice.status === 'void') {
    return errorResult('Diese Rechnung ist bereits storniert.');
  }

  const isNumbered = invoice.status !== 'draft';
  const reason = parsed.data.reason?.trim() ?? '';
  if (isNumbered && reason.length === 0) {
    return errorResult('Bitte einen Storno-Grund angeben.');
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'void',
      void_reason: reason || null,
      voided_at: new Date().toISOString(),
      voided_by: user.id,
    })
    .eq('id', invoice.id);
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: invoice.organization_id,
    action: 'update',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: {
      event: 'void',
      number: invoice.invoice_number,
      reason: reason || null,
    },
  });

  revalidatePath(`/app/clients/${invoice.client_company_id}`);
  return successResult(
    isNumbered
      ? `Rechnung ${invoice.invoice_number ?? ''} storniert.`.trim()
      : 'Entwurf verworfen.',
  );
}

/**
 * Rendert das PDF einer nummerierten Rechnung neu (gleiche Nummer und Daten) –
 * z. B. damit ein neu hinterlegtes Logo erscheint. Entwürfe haben noch kein PDF.
 */
export async function regenerateInvoicePdfAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const loaded = await loadInvoiceForManage(parsed.data.invoiceId);
  if (!loaded.ok) return loaded.result;
  const { supabase, invoice, user } = loaded;
  if (invoice.status === 'draft') {
    return errorResult('Bitte die Rechnung zuerst finalisieren.');
  }

  const entity = await resolveInvoiceEntity(supabase, invoice);
  if (!entity?.company_name || !entity.iban) {
    return errorResult(
      'Bitte zuerst die Firmen- und Bankdaten des Rechnungsstellers ausfüllen.',
    );
  }

  const stored = await renderAndStoreInvoicePdf(supabase, invoice, entity);
  if (!stored.ok) return stored.result;

  if (invoice.pdf_path !== stored.path) {
    await supabase
      .from('invoices')
      .update({ pdf_path: stored.path })
      .eq('id', invoice.id);
  }

  await logActivity({
    actorId: user.id,
    organizationId: invoice.organization_id,
    action: 'update',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: { event: 'regenerate', number: invoice.invoice_number },
  });

  revalidatePath(`/app/clients/${invoice.client_company_id}`);
  return successResult('PDF neu generiert.');
}

/** Empfänger-E-Mails: der hinterlegte Rechnungsempfänger gewinnt, sonst die
 *  allgemeine Kontakt-E-Mail + die Portal-Kontakte. */
async function resolveInvoiceRecipients(
  service: ReturnType<typeof createSupabaseServiceClient>,
  clientCompanyId: string,
): Promise<string[]> {
  const { data: company } = await service
    .from('client_companies')
    .select('invoice_recipient_email, contact_email')
    .eq('id', clientCompanyId)
    .maybeSingle();
  const explicit = (company as { invoice_recipient_email?: string | null } | null)
    ?.invoice_recipient_email;
  if (explicit) return [explicit];
  const emails = new Set<string>();
  if (company?.contact_email) emails.add(company.contact_email);
  const { data: contacts } = await service
    .from('client_contacts')
    .select('user_id')
    .eq('client_company_id', clientCompanyId);
  for (const c of contacts ?? []) {
    const { data } = await service.auth.admin.getUserById(c.user_id);
    if (data?.user?.email) emails.add(data.user.email);
  }
  return [...emails];
}

/** Speichert den Rechnungsempfänger (E-Mail) des Kunden. Leer = zurücksetzen. */
export async function setInvoiceRecipientAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      clientCompanyId: z.string().uuid(),
      email: z.string().trim().max(320).email().or(z.literal('')),
    })
    .safeParse({
      clientCompanyId: formData.get('clientCompanyId'),
      email: formData.get('email') ?? '',
    });
  if (!parsed.success) return errorResult('Bitte eine gültige E-Mail angeben.');

  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', parsed.data.clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.NOT_FOUND);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: company.organization_id });

  const { error } = await supabase
    .from('client_companies')
    .update({ invoice_recipient_email: parsed.data.email || null } as never)
    .eq('id', parsed.data.clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Rechnungsempfänger gespeichert.');
}

/** Sendet die (finalisierte) Rechnung als PDF an den Rechnungsempfänger. */
export async function sendInvoiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const loaded = await loadInvoiceForManage(parsed.data.invoiceId);
  if (!loaded.ok) return loaded.result;
  const { supabase, invoice } = loaded;
  if (invoice.status === 'draft' || !invoice.pdf_path) {
    return errorResult('Bitte die Rechnung zuerst finalisieren.');
  }

  const service = createSupabaseServiceClient();
  const recipients = await resolveInvoiceRecipients(service, invoice.client_company_id);
  if (recipients.length === 0) {
    return errorResult('Kein Rechnungsempfänger hinterlegt – bitte oben eine E-Mail eintragen.');
  }

  const { data: blob } = await service.storage.from(FILES_BUCKET).download(invoice.pdf_path);
  if (!blob) return errorResult('Rechnungs-PDF nicht gefunden.');
  const bytes = Buffer.from(await blob.arrayBuffer());

  const number = invoice.invoice_number ?? '';
  const { html, text } = renderEmail({
    heading: `Ihre Rechnung ${number}`.trim(),
    intro: 'anbei erhalten Sie Ihre Rechnung als PDF.',
    bodyLines: [`Rechnungsbetrag: ${formatEuroCents(invoice.gross_cents)}`],
    footer: 'Diese E-Mail wurde über das Supevo Dashboard versendet.',
  });
  const ok = await sendEmail({
    to: recipients,
    subject: `Ihre Rechnung ${number}`.trim(),
    html,
    text,
    attachments: [
      { filename: `Rechnung-${number || invoice.id}.pdf`, content: bytes },
    ],
  });
  if (!ok) {
    return errorResult('E-Mail konnte nicht versendet werden (ist der Mailversand konfiguriert?).');
  }

  await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoice.id);
  await logActivity({
    actorId: loaded.user.id,
    organizationId: invoice.organization_id,
    action: 'update',
    entityType: 'invoice',
    entityId: invoice.id,
    metadata: { event: 'sent', to: recipients },
  });
  revalidatePath(`/app/clients/${invoice.client_company_id}`);
  return successResult(`Rechnung an ${recipients.join(', ')} gesendet.`);
}

/** Single dispatcher so one row form can drive several operations via `op`. */
export async function invoiceOpAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  switch (formData.get('op')) {
    case 'finalize':
      return finalizeInvoiceAction(prev, formData);
    case 'send':
      return sendInvoiceAction(prev, formData);
    case 'sent':
      return markInvoiceSentAction(prev, formData);
    case 'paid':
      return markInvoicePaidAction(prev, formData);
    case 'void':
      return voidInvoiceAction(prev, formData);
    case 'regenerate':
      return regenerateInvoicePdfAction(prev, formData);
    default:
      return errorResult(de.errors.VALIDATION);
  }
}
