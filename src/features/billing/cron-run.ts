import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import { formatEuroCents } from '@/lib/money';
import { sendEmail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { FILES_BUCKET } from '@/lib/files/storage';
import {
  createDraftInvoice,
  assignInvoiceNumber,
  resolveClientEntity,
  type BillingEntity,
} from '@/features/billing/invoice-service';
import { renderInvoicePdf } from '@/features/billing/invoice-pdf';
import { promoteIfDue } from '@/features/memberships/configurator-queries';
import type { Database } from '@/lib/database.types';

type Membership = Database['public']['Tables']['client_memberships']['Row'];

/** Adds `months` to an ISO date, clamping the day to 28 for safety. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1 + months, Math.min(d!, 28)));
  return date.toISOString().slice(0, 10);
}

function entityComplete(e: BillingEntity | null): e is BillingEntity {
  return !!e && !!e.company_name && !!e.iban;
}

/** Resolves the client's notification emails (company address + contacts). */
async function clientEmails(
  service: ReturnType<typeof createSupabaseServiceClient>,
  clientCompanyId: string,
): Promise<string[]> {
  const emails = new Set<string>();
  const { data: company } = await service
    .from('client_companies')
    .select('contact_email')
    .eq('id', clientCompanyId)
    .maybeSingle();
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

/** Finalizes a draft with the service client: number + PDF + storage. */
async function finalizeWithService(
  service: ReturnType<typeof createSupabaseServiceClient>,
  invoiceId: string,
  orgId: string,
  entity: BillingEntity,
  membership: Membership,
): Promise<{ number: string; pdf: Uint8Array; grossCents: number } | null> {
  const { data: invoice } = await service
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  const numberResult = await assignInvoiceNumber(service, entity.id);
  if ('error' in numberResult) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await service
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true });

  let pdf: Uint8Array;
  try {
    pdf = await renderInvoicePdf({
      invoice: {
        ...invoice,
        invoice_number: numberResult.number,
        issue_date: today,
        due_date: today,
      },
      items: items ?? [],
      settings: entity,
      membership,
    });
  } catch (e) {
    logger.error('cron.pdf.failed', { error: (e as Error).message });
    return null;
  }

  const path = `org/${orgId}/invoices/${invoiceId}.pdf`;
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    logger.error('cron.pdf.upload_failed', { error: upErr.message });
    return null;
  }

  await service
    .from('invoices')
    .update({
      invoice_number: numberResult.number,
      issue_date: today,
      due_date: today,
      status: 'finalized',
      pdf_path: path,
    })
    .eq('id', invoiceId);

  return { number: numberResult.number, pdf, grossCents: invoice.gross_cents };
}

export interface CronResult {
  processed: number;
  drafts: number;
  sent: number;
  errors: number;
}

/**
 * Processes all memberships due for billing (next_invoice_date <= today).
 * For each: creates a draft, and — when auto_send is on and the org's billing
 * data is complete — finalizes it, emails the PDF and marks it sent. Then
 * advances the next billing date. Runs with the service client (system job).
 */
export async function runDueInvoices(): Promise<CronResult> {
  const service = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const result: CronResult = { processed: 0, drafts: 0, sent: 0, errors: 0 };

  const { data: due } = await service
    .from('client_memberships')
    .select('*')
    .eq('status', 'active')
    .lte('next_invoice_date', today);
  if (!due || due.length === 0) return result;

  for (const rawMembership of due as Membership[]) {
    result.processed += 1;
    try {
      // Eine fällige, geplante Mitgliedschafts-Änderung zuerst aktiv schalten,
      // damit die Rechnung schon den neuen Preis nutzt.
      const membership = await promoteIfDue(service, rawMembership);
      // Each client bills from its assigned entity (else the org's default),
      // so the sender + invoice-number sequence come from that entity.
      const entity = await resolveClientEntity(
        service,
        membership.organization_id,
        membership.client_company_id,
      );

      const draft = await createDraftInvoice({
        supabase: service,
        orgId: membership.organization_id,
        clientCompanyId: membership.client_company_id,
        membership,
        settings: entity,
        billingEntityId: entity?.id ?? null,
        createdBy: null, // system job; no user actor
      });
      if ('error' in draft) {
        result.errors += 1;
        continue;
      }

      if (membership.auto_send && entityComplete(entity)) {
        const fin = await finalizeWithService(
          service,
          draft.invoiceId,
          membership.organization_id,
          entity,
          membership,
        );
        if (fin) {
          const emails = await clientEmails(service, membership.client_company_id);
          if (emails.length > 0) {
            const { html, text } = renderEmail({
              heading: `Ihre Rechnung ${fin.number}`,
              intro: 'anbei erhalten Sie Ihre aktuelle Rechnung als PDF.',
              bodyLines: [`Rechnungsbetrag: ${formatEuroCents(fin.grossCents)}`],
              footer:
                'Diese E-Mail wurde automatisch vom Supevo Dashboard versendet.',
            });
            const ok = await sendEmail({
              to: emails,
              subject: `Ihre Rechnung ${fin.number}`,
              html,
              text,
              attachments: [
                { filename: `Rechnung-${fin.number}.pdf`, content: Buffer.from(fin.pdf) },
              ],
            });
            if (ok) {
              await service
                .from('invoices')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', draft.invoiceId);
              result.sent += 1;
            } else {
              result.drafts += 1; // finalized but not emailed
            }
          } else {
            result.drafts += 1;
          }
        } else {
          result.errors += 1;
        }
      } else {
        result.drafts += 1;
      }

      // Advance the schedule regardless, so we don't reprocess today.
      const base = membership.next_invoice_date ?? today;
      await service
        .from('client_memberships')
        .update({ next_invoice_date: addMonths(base, membership.interval_months) })
        .eq('id', membership.id);
    } catch (e) {
      result.errors += 1;
      logger.error('cron.membership.failed', {
        membership: rawMembership.id,
        error: (e as Error).message,
      });
    }
  }

  logger.info('cron.invoices.done', { ...result });
  return result;
}
