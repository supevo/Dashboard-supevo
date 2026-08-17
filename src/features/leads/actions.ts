'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { can } from '@/lib/authz/policies';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  normalizeSelections,
  totalMonthlyCents,
  type ModuleDef,
  type ModuleSelection,
  type PriceContext,
} from '@/features/memberships/modules';
import { getModuleCatalog } from '@/features/memberships/catalog-queries';
import { generateProjectTasks } from '@/features/leads/generate-tasks';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

type Service = ReturnType<typeof createSupabaseServiceClient>;

interface LeadForConvert {
  id: string;
  organization_id: string;
  contact_name: string;
  company: string | null;
  email: string | null;
  note: string | null;
  modules: unknown;
  offer_name: string | null;
  estimated_value_cents: number | null;
  converted_client_company_id: string | null;
}

/** Menschlich lesbare Modulzeilen (inkl. Keywords/Budget) für die KI. */
function moduleLinesFor(
  catalog: ModuleDef[],
  selections: ModuleSelection[],
): string[] {
  const byKey = new Map(catalog.map((d) => [d.key, d]));
  const lines: string[] = [];
  for (const s of selections) {
    if (!s.enabled) continue;
    const def = byKey.get(s.id);
    if (!def) continue;
    const extras: string[] = [];
    if (def.pricing.kind === 'per_unit' && s.qty) {
      extras.push(`${s.qty} ${def.pricing.unitLabel}`);
    }
    if (def.keywordCents > 0) {
      extras.push(`${s.keywords ?? def.keywordDefault} Keywords`);
    }
    if (def.captureBudget && s.budgetCents) {
      extras.push(`Werbebudget ${Math.round(s.budgetCents / 100)} €/Monat`);
    }
    lines.push(def.label + (extras.length ? ` (${extras.join(', ')})` : ''));
  }
  return lines;
}

/**
 * Legt (idempotent) Kundenunternehmen + Mitgliedschaft aus einem Lead an.
 * Gibt die client_company_id zurück oder eine Fehlermeldung.
 */
async function ensureClientForLead(
  service: Service,
  lead: LeadForConvert,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  if (lead.converted_client_company_id) {
    return { id: lead.converted_client_company_id };
  }
  const selections = normalizeSelections(lead.modules);
  const hasSupevo = selections.some(
    (s) => s.enabled && (s.id === 'supevo_stage1' || s.id === 'supevo_stage2'),
  );
  const stage = selections.some((s) => s.enabled && s.id === 'supevo_stage2') ? 2 : 1;

  const { data: company, error: cErr } = await service
    .from('client_companies')
    .insert({
      organization_id: lead.organization_id,
      name: lead.company || lead.contact_name,
      contact_email: lead.email || null,
      notes: lead.note || null,
      is_legacy: !hasSupevo,
      created_by: userId,
    })
    .select('id')
    .single();
  if (cErr || !company) {
    return { error: 'Kunde konnte nicht angelegt werden (Name evtl. schon vergeben).' };
  }

  const { error: mErr } = await service.from('client_memberships').insert({
    organization_id: lead.organization_id,
    client_company_id: company.id,
    modules: selections as unknown,
    custom_net_cents: lead.estimated_value_cents ?? 0,
    custom_name: lead.offer_name || 'Individuell',
    stage,
  });
  if (mErr) return { error: 'Mitgliedschaft konnte nicht angelegt werden.' };
  return { id: company.id };
}

const createSchema = z.object({
  contactName: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(200),
  company: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(60).optional().or(z.literal('')),
  source: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(4000).optional().or(z.literal('')),
  industry: z.string().max(200).optional().or(z.literal('')),
  goals: z.string().max(4000).optional().or(z.literal('')),
  targetGroup: z.string().max(2000).optional().or(z.literal('')),
  website: z.string().max(300).optional().or(z.literal('')),
  value: z.string().max(20).optional().or(z.literal('')),
});

/** Reads the Lead-Kontextfelder aus einem FormData (create + update teilen sie). */
function contextFieldsFrom(fd: FormData) {
  return {
    industry: fd.get('industry') ?? '',
    goals: fd.get('goals') ?? '',
    targetGroup: fd.get('targetGroup') ?? '',
    website: fd.get('website') ?? '',
  };
}

function parseEuroToCents(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Creates a new lead in the pipeline (agency staff). */
export async function createLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    contactName: formData.get('contactName'),
    company: formData.get('company') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    source: formData.get('source') ?? '',
    note: formData.get('note') ?? '',
    ...contextFieldsFrom(formData),
    value: formData.get('value') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').insert({
    organization_id: orgId,
    contact_name: d.contactName,
    company: d.company || null,
    email: d.email || null,
    phone: d.phone || null,
    source: d.source || null,
    note: d.note || null,
    industry: d.industry || null,
    goals: d.goals || null,
    target_group: d.targetGroup || null,
    website: d.website || null,
    estimated_value_cents: parseEuroToCents(d.value ?? ''),
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Lead angelegt.');
}

/** Moves a lead to another pipeline status. */
export async function setLeadStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(['new', 'contacted', 'offer', 'won', 'lost']),
    })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('leads')
    .update({ status: parsed.data.status }, { count: 'exact' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Status aktualisiert.');
}

const offerSelectionSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  qty: z.number().int().min(0).max(1000).optional(),
  budgetCents: z.number().int().min(0).max(100_000_00).optional(),
  budgetVia: z.enum(['us', 'google']).optional(),
  keywords: z.number().int().min(0).max(1000).optional(),
});
const saveOfferSchema = z.object({
  leadId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  selections: z.array(offerSelectionSchema).max(50),
  redeemedPromotions: z.array(z.string().min(1).max(64)).max(50).optional(),
});

/**
 * Saves the Onboarding-Angebot (module baukasten) on a lead. The offer's net
 * total is stored in estimated_value_cents so it also shows on the lead card.
 * RLS-scoped: the update only touches leads of the caller's agency org.
 */
export async function saveLeadOfferAction(input: unknown): Promise<ActionResult> {
  const parsed = saveOfferSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { leadId, name } = parsed.data;
  const selections = normalizeSelections(parsed.data.selections);
  const redeemedPromotions = [...new Set(parsed.data.redeemedPromotions ?? [])];

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('organization_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return errorResult(de.errors.FORBIDDEN);

  const { data: s } = await createSupabaseServiceClient()
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', lead.organization_id)
    .maybeSingle();
  const ctx: PriceContext = {
    stage1NetCents: s?.stage1_net_cents ?? 0,
    stage2NetCents: s?.stage2_net_cents ?? 0,
  };
  const catalog = await getModuleCatalog(lead.organization_id);
  const netCents = totalMonthlyCents(catalog, selections, ctx);

  const { error, count } = await supabase
    .from('leads')
    .update(
      {
        modules: selections as unknown,
        redeemed_promotions: redeemedPromotions as unknown,
        offer_name: name?.trim() || 'Individuell',
        estimated_value_cents: netCents,
      },
      { count: 'exact' },
    )
    .eq('id', leadId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  return successResult('Angebot gespeichert.');
}

/**
 * Wandelt einen gewonnenen Lead in einen Kunden um: legt ein Kundenunternehmen
 * an und erstellt daraus eine Mitgliedschaft aus dem Angebots-Baukasten. Ohne
 * supevo-Stage-Modul gilt der Kunde als Legacy (sieht später die Module im
 * Portal). Idempotent: ist der Lead schon umgewandelt, wird nur der bestehende
 * Kunde zurückgegeben.
 */
export async function convertLeadToClientAction(leadId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(leadId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select(
      'id, organization_id, contact_name, company, email, note, modules, offer_name, estimated_value_cents, converted_client_company_id',
    )
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return errorResult(de.errors.FORBIDDEN);

  authorize(user, { type: 'clientCompany.create', orgId: lead.organization_id });

  // Schon umgewandelt → bestehenden Kunden zurückgeben (keine Doppel-Anlage).
  if (lead.converted_client_company_id) {
    return successResult('Lead ist bereits ein Kunde.', {
      id: lead.converted_client_company_id,
    });
  }

  const service = createSupabaseServiceClient();
  const res = await ensureClientForLead(service, lead as LeadForConvert, user.id);
  if ('error' in res) return errorResult(res.error);

  await service
    .from('leads')
    .update({ status: 'won', converted_client_company_id: res.id })
    .eq('id', leadId);

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath('/app/clients');
  return successResult('Lead als Kunde übernommen – Mitgliedschaft angelegt.', {
    id: res.id,
  });
}

/**
 * Schritt 1 der Projekt-Umwandlung: KI-Aufgabenvorschläge für den Lead erzeugen
 * (legt noch NICHTS an – nur Vorschau). Nutzt Module + Kontextfelder des Leads.
 */
export async function generateLeadTasksAction(leadId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(leadId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select(
      'id, organization_id, contact_name, company, note, industry, goals, target_group, website, modules, offer_name',
    )
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return errorResult(de.errors.FORBIDDEN);

  const catalog = await getModuleCatalog(lead.organization_id);
  const selections = normalizeSelections(lead.modules);
  const moduleLines = moduleLinesFor(catalog, selections);

  const tasks = await generateProjectTasks({
    company: lead.company || lead.contact_name,
    industry: lead.industry,
    goals: lead.goals,
    targetGroup: lead.target_group,
    website: lead.website,
    note: lead.note,
    moduleLines,
  });

  const projectName = lead.offer_name && lead.offer_name !== 'Individuell'
    ? `${lead.company || lead.contact_name} – ${lead.offer_name}`
    : `${lead.company || lead.contact_name} – Onboarding`;

  return successResult(
    tasks.length > 0 ? 'Vorschläge erstellt.' : 'Keine KI-Vorschläge (KI evtl. nicht aktiv).',
    { tasks, projectName },
  );
}

const convertProjectSchema = z.object({
  leadId: z.string().uuid(),
  projectName: z.string().trim().min(1, 'Bitte einen Projektnamen angeben.').max(200),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional().or(z.literal('')),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      }),
    )
    .max(30),
});

/**
 * Schritt 2: Lead → Kunde + Projekt + (geprüfte) Aufgaben in einem Rutsch.
 * Legt Kunde/Mitgliedschaft an (falls noch nicht), erstellt ein Projekt und
 * füllt dessen Warteschlange mit den bestätigten Aufgaben.
 */
export async function convertLeadToProjectAction(input: unknown): Promise<ActionResult> {
  const parsed = convertProjectSchema.safeParse(input);
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const { leadId, projectName, tasks } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from('leads')
    .select(
      'id, organization_id, contact_name, company, email, note, modules, offer_name, estimated_value_cents, converted_client_company_id',
    )
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return errorResult(de.errors.FORBIDDEN);

  const orgId = lead.organization_id;
  authorize(user, { type: 'clientCompany.create', orgId });
  if (!can(user, { type: 'project.create', orgId })) {
    return errorResult('Nur Projektleitung oder Admins dürfen Projekte anlegen.');
  }

  const service = createSupabaseServiceClient();
  const client = await ensureClientForLead(service, lead as LeadForConvert, user.id);
  if ('error' in client) return errorResult(client.error);

  // Projekt anlegen (Trigger create_default_board erzeugt Board + Spalten).
  const projectId = randomUUID();
  const { error: pErr } = await service.from('projects').insert({
    id: projectId,
    organization_id: orgId,
    client_company_id: client.id,
    name: projectName,
    status: 'active',
    lead_user_id: user.id,
    created_by: user.id,
  });
  if (pErr) return errorResult('Projekt konnte nicht angelegt werden.');

  // Warteschlange-Spalte des frisch erzeugten Boards finden (Trigger legt sie an).
  const { data: boards } = await service
    .from('boards')
    .select('id')
    .eq('project_id', projectId);
  const boardIds = (boards ?? []).map((b) => b.id);
  const { data: column } = boardIds.length
    ? await service
        .from('board_columns')
        .select('id, board_id')
        .in('board_id', boardIds)
        .eq('column_key', 'queue')
        .maybeSingle()
    : { data: null };

  if (column && tasks.length > 0) {
    const rows = tasks.map((t, i) => ({
      organization_id: orgId,
      project_id: projectId,
      board_id: column.board_id,
      column_id: column.id,
      title: t.title,
      description: t.description ? t.description : null,
      priority: t.priority ?? 'medium',
      is_internal: true,
      position: (i + 1) * 1000,
      created_by: user.id,
    }));
    await service.from('tasks').insert(rows);
  }

  await service
    .from('leads')
    .update({ status: 'won', converted_client_company_id: client.id })
    .eq('id', leadId);

  revalidatePath('/app/leads');
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath('/app/clients');
  return successResult('Projekt mit Aufgaben angelegt.', {
    clientCompanyId: client.id,
    projectId,
  });
}

/** Updates a lead's core fields (edit on the board). RLS-scoped via count. */
export async function updateLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '');
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const parsed = createSchema.safeParse({
    contactName: formData.get('contactName'),
    company: formData.get('company') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    source: formData.get('source') ?? '',
    note: formData.get('note') ?? '',
    ...contextFieldsFrom(formData),
    value: formData.get('value') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('leads')
    .update(
      {
        contact_name: d.contactName,
        company: d.company || null,
        email: d.email || null,
        phone: d.phone || null,
        source: d.source || null,
        note: d.note || null,
        industry: d.industry || null,
        goals: d.goals || null,
        target_group: d.targetGroup || null,
        website: d.website || null,
        estimated_value_cents: parseEuroToCents(d.value ?? ''),
      },
      { count: 'exact' },
    )
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/leads');
  return successResult('Lead aktualisiert.');
}

/** Moves a lead to another status column (drag & drop on the board). */
export async function moveLeadAction(
  leadId: string,
  status: 'new' | 'contacted' | 'offer' | 'won' | 'lost',
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(leadId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('leads')
    .update({ status }, { count: 'exact' })
    .eq('id', leadId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);
  revalidatePath('/app/leads');
  return successResult('Verschoben.');
}

/** Deletes a lead. */
export async function deleteLeadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('leads').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/leads');
  return successResult('Lead gelöscht.');
}
