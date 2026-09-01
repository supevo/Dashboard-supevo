'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { isAgencyStaffInOrg } from '@/lib/authz/policies';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const toggleSchema = z.object({
  clientCompanyId: z.string().uuid(),
  billPrint: z.enum(['true', 'false']),
  // Optionaler Aufschlag-Override in Prozent. Leer = Standard (20/100).
  markupPercent: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, 'Bitte eine ganze Zahl (0–1000) eingeben.')
    .optional(),
});

/**
 * Turns print-product billing on/off for a client. Admin-only: authorized in
 * code after an RLS read of the company, then written with the service client.
 */
export async function setPrintBillingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    billPrint: formData.get('billPrint'),
    markupPercent: formData.get('markupPercent') ?? undefined,
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, billPrint, markupPercent } = parsed.data;
  // Leer → Standard (NULL). Sonst auf 0–1000 begrenzen.
  const markupValue =
    markupPercent == null || markupPercent === ''
      ? null
      : Math.min(1000, Math.max(0, Number.parseInt(markupPercent, 10)));

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);

  const rls = await createSupabaseServerClient();
  const { data: company } = await rls
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.NOT_FOUND);
  // Teil der Kunden-Abrechnung → alle Agentur-Mitarbeiter der Organisation.
  if (!isAgencyStaffInOrg(user, company.organization_id)) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const { error } = await createSupabaseServiceClient()
    .from('client_companies')
    .update({
      bill_print_products: billPrint === 'true',
      print_markup_percent: markupValue,
    } as never)
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Drucksachen-Einstellung gespeichert.');
}

/**
 * Dismisses a print-billing prompt on a task (false positive). Sets the terminal
 * status 'dismissed' so the detection won't re-flag it. Agency staff only.
 */
export async function dismissPrintBillingAction(
  taskId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  // RLS returns the task only to agency staff of its org (access gate).
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { ok: false };

  const { error } = await createSupabaseServiceClient()
    .from('tasks')
    .update({ print_billing_status: 'dismissed' })
    .eq('id', taskId)
    .eq('print_billing_status', 'required');
  if (error) return { ok: false };

  revalidatePath('/app/projects');
  return { ok: true };
}

/**
 * Employee confirms the detected print product WAS ordered → status 'ordered'.
 * The task then shows the "supplier invoice missing" prompt until uploaded.
 * Agency staff only (RLS read gate, service-client write). Only advances from
 * the open 'required' state.
 */
export async function confirmPrintOrderedAction(
  taskId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { ok: false };

  const { error } = await createSupabaseServiceClient()
    .from('tasks')
    .update({ print_billing_status: 'ordered' })
    .eq('id', taskId)
    .eq('print_billing_status', 'required');
  if (error) return { ok: false };

  revalidatePath('/app/projects');
  return { ok: true };
}

/**
 * Employee marks that the CLIENT settles the printer's invoice themselves →
 * status 'self_paid'. No outgoing invoice is created for this job; a supplier
 * invoice may still be uploaded as an internal record. Agency staff only.
 * Allowed from the open states ('required'/'ordered').
 */
export async function markPrintSelfPaidAction(
  taskId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { ok: false };

  const { error } = await createSupabaseServiceClient()
    .from('tasks')
    .update({ print_billing_status: 'self_paid' })
    .eq('id', taskId)
    .in('print_billing_status', ['required', 'ordered']);
  if (error) return { ok: false };

  revalidatePath('/app/projects');
  return { ok: true };
}

/**
 * Erzeugt die Druck-Sammelrechnungen (Entwürfe) sofort statt auf den Monats-Cron
 * zu warten – für Test und Ad-hoc-Abrechnung. Nur Super-Admin.
 */
export async function runPrintInvoicesNowAction(): Promise<
  { ok: true; invoicesCreated: number; expensesBilled: number } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: de.errors.UNAUTHENTICATED };
  const { isSuperAdmin } = await import('@/lib/authz/policies');
  if (!isSuperAdmin(user)) return { ok: false, error: de.errors.FORBIDDEN };

  const { runMonthlyPrintInvoices } = await import(
    '@/features/print-billing/print-invoice-run'
  );
  const result = await runMonthlyPrintInvoices();
  revalidatePath('/app/finance');
  return {
    ok: true,
    invoicesCreated: result.invoicesCreated,
    expensesBilled: result.expensesBilled,
  };
}

/** Deletes a recorded print expense (admin-only; RLS also enforces this). */
export async function deletePrintExpenseAction(
  expenseId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('print_expenses')
    .delete()
    .eq('id', expenseId);
  if (error) return { ok: false };
  revalidatePath('/app/finance');
  return { ok: true };
}
