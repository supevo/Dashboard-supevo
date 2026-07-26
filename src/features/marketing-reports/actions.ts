'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import type { ReportScreenshot } from './queries';

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  clientCompanyId: z.string().uuid(),
  periodLabel: z.string().trim().min(1).max(120),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ranking: z.string().trim().max(4000).optional().or(z.literal('')),
  sea: z.string().trim().max(4000).optional().or(z.literal('')),
  inquiries: z.string().trim().max(4000).optional().or(z.literal('')),
  summary: z.string().trim().max(4000).optional().or(z.literal('')),
  screenshots: z.string().max(6000).optional().or(z.literal('')),
  published: z.string().optional(),
});

/** Parses "url" or "url | caption" lines into screenshot entries (http/https only). */
function parseScreenshots(raw: string): ReportScreenshot[] {
  const out: ReportScreenshot[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [urlPart, ...captionParts] = trimmed.split('|');
    const url = (urlPart ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      url,
      caption: captionParts.join('|').trim() || undefined,
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** Creates or updates a marketing report (agency only). */
export async function upsertMarketingReportAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    id: formData.get('id') ?? '',
    clientCompanyId: formData.get('clientCompanyId'),
    periodLabel: formData.get('periodLabel'),
    periodStart: formData.get('periodStart'),
    ranking: formData.get('ranking') ?? '',
    sea: formData.get('sea') ?? '',
    inquiries: formData.get('inquiries') ?? '',
    summary: formData.get('summary') ?? '',
    screenshots: formData.get('screenshots') ?? '',
    published: formData.get('published') ?? undefined,
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const p = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();

  // Ensure the target company belongs to the agency's org (RLS also enforces this).
  const { data: company } = await supabase
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', p.clientCompanyId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const row = {
    organization_id: orgId,
    client_company_id: p.clientCompanyId,
    period_label: p.periodLabel,
    period_start: p.periodStart,
    ranking: p.ranking ? p.ranking : null,
    sea: p.sea ? p.sea : null,
    inquiries: p.inquiries ? p.inquiries : null,
    summary: p.summary ? p.summary : null,
    screenshots: parseScreenshots(p.screenshots ?? ''),
    published: p.published === 'on' || p.published === 'true',
    created_by: user.id,
  };

  const query = p.id
    ? supabase.from('marketing_reports').update(row).eq('id', p.id)
    : supabase.from('marketing_reports').insert(row);
  const { error } = await query;
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${p.clientCompanyId}`);
  revalidatePath('/portal/reports');
  return successResult(p.id ? 'Bericht aktualisiert.' : 'Bericht erstellt.');
}

/** Deletes a marketing report (agency only). */
export async function deleteMarketingReportAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.string().uuid(), clientCompanyId: z.string().uuid() })
    .safeParse({
      id: formData.get('id'),
      clientCompanyId: formData.get('clientCompanyId'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('marketing_reports')
    .delete()
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  revalidatePath('/portal/reports');
  return successResult('Bericht gelöscht.');
}
