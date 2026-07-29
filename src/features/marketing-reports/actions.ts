'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { gatherClientWeek } from '@/features/recap/context';
import { generateRecap } from '@/features/recap/generate';
import type { ReportScreenshot } from './queries';

/**
 * Builds a weekly-report summary draft from the client's project tasks (the
 * work the agency actually did). Reuses the recap generator; on AI-off it falls
 * back to a plain bullet list. Returns hasActivity=false when the week is empty.
 */
export async function generateReportDraftAction(
  clientCompanyId: string,
): Promise<{ ok: boolean; summary?: string; hasActivity?: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return { ok: false, error: de.errors.VALIDATION };
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { ok: false, error: de.errors.FORBIDDEN };

  try {
    const ctx = await gatherClientWeek(clientCompanyId);
    if (!ctx.hasActivity) return { ok: true, hasActivity: false, summary: '' };

    const draft = await generateRecap(ctx);
    if (draft) return { ok: true, hasActivity: true, summary: draft };

    // AI off/failed → plain summary from the tasks so the button still works.
    const lines: string[] = [];
    if (ctx.completed.length) {
      lines.push('Diese Woche abgeschlossen:', ...ctx.completed.map((t) => `• ${t}`));
    }
    if (ctx.ongoing.length) {
      if (lines.length) lines.push('');
      lines.push('Laufend / als Nächstes:', ...ctx.ongoing.map((t) => `• ${t}`));
    }
    return { ok: true, hasActivity: true, summary: lines.join('\n') };
  } catch {
    return { ok: false, error: 'Konnte keinen Entwurf erstellen.' };
  }
}

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

  // Write with the service client (agency access + org ownership already
  // verified above) so a missing/strict RLS policy can't turn a valid save into
  // the generic "unexpected error".
  const service = createSupabaseServiceClient();
  const { error } = p.id
    ? await service.from('marketing_reports').update(row).eq('id', p.id).eq('organization_id', orgId)
    : await service.from('marketing_reports').insert(row);
  if (error) return errorResult(`Speichern fehlgeschlagen: ${error.message}`);

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
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('marketing_reports')
    .delete()
    .eq('id', parsed.data.id)
    .eq('organization_id', orgId);
  if (error) return errorResult(`Löschen fehlgeschlagen: ${error.message}`);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  revalidatePath('/portal/reports');
  return successResult('Bericht gelöscht.');
}
