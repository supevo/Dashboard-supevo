import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { getClientMembership } from '@/features/billing/membership';
import { getMembershipConfigurator } from '@/features/memberships/configurator-queries';
import { createClientCompanyAction } from '@/features/client-companies/actions';
import { updateClientProfileAction } from '@/features/client-companies/actions';
import { saveMembershipBillingAction } from '@/features/billing/membership-actions';
import { saveMembershipConfigAction } from '@/features/memberships/configurator-actions';
import { createTaskAction } from '@/features/tasks/actions';
import { assignTaskAction, unassignTaskAction } from '@/features/tasks/assignee-actions';
import { addAssetLinkAction } from '@/features/assets/actions';
import { idleResult, type ActionResult } from '@/lib/action-result';

/** Message from any action result (idle has none). */
function errMsg(res: ActionResult): string {
  return 'message' in res && res.message ? res.message : 'unbekannter Fehler';
}
function resData(res: ActionResult): Record<string, unknown> {
  return res.status === 'success' && res.data ? res.data : {};
}

/**
 * Werkzeuge des KI-Assistenten. Jedes Schreib-Werkzeug ruft die bestehende
 * Server-Action auf, damit Autorisierung, RLS und Aktivitätsprotokoll GENAU wie
 * bei manueller Bedienung greifen – der Assistent handelt mit den Rechten des
 * angemeldeten Nutzers, nie darüber hinaus. Suche/Auflösung läuft über den
 * RLS-Client, sodass der Assistent nur sieht, was der Nutzer sehen darf.
 */

/** OpenAI-Function-Definitionen (Tools). */
export const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'find_client',
      description:
        'Sucht Kundenunternehmen anhand (Teil-)Namens. Immer zuerst aufrufen, um aus „Kunde XY" die clientCompanyId aufzulösen.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Name oder Teil davon' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_team_member',
      description:
        'Sucht Agentur-Mitarbeiter anhand (Teil-)Namens und liefert deren userId (für Aufgaben-Zuweisung).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_client_projects',
      description: 'Listet die Projekte/Boards eines Kunden (für das Anlegen von Aufgaben).',
      parameters: {
        type: 'object',
        properties: { clientCompanyId: { type: 'string' } },
        required: ['clientCompanyId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_task',
      description: 'Sucht Aufgaben anhand des Titels (optional auf einen Kunden eingeschränkt).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          clientCompanyId: { type: 'string', description: 'optional' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Legt eine Aufgabe in einem Projekt an (landet in der ersten Spalte). Optional direkt einem Mitarbeiter zuweisen.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          assigneeUserId: { type: 'string', description: 'optional: userId des Verantwortlichen' },
        },
        required: ['projectId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reassign_task',
      description:
        'Weist eine Aufgabe neu zu: toUserId übernimmt, fromUserId (optional) wird entfernt. Für „X soll Aufgabe von Y übernehmen".',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          taskId: { type: 'string' },
          toUserId: { type: 'string' },
          fromUserId: { type: 'string', description: 'optional: bisheriger Verantwortlicher' },
        },
        required: ['projectId', 'taskId', 'toUserId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_client',
      description: 'Legt einen neuen Kunden an (Name, optional Kontakt-E-Mail und Notizen).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contactEmail: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_client_contact',
      description: 'Aktualisiert Kontakt-/Profildaten eines Kunden (Kontakt-E-Mail, Branche, Marken, Interessen).',
      parameters: {
        type: 'object',
        properties: {
          clientCompanyId: { type: 'string' },
          contactEmail: { type: 'string' },
          industry: { type: 'string' },
          brands: { type: 'string' },
          interests: { type: 'string' },
        },
        required: ['clientCompanyId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_client_address',
      description:
        'Setzt Rechnungsadresse und/oder IBAN eines Kunden. Voraussetzung: der Kunde hat bereits eine Mitgliedschaft.',
      parameters: {
        type: 'object',
        properties: {
          clientCompanyId: { type: 'string' },
          billingName: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          postalCode: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
          iban: { type: 'string' },
          bic: { type: 'string' },
          vatId: { type: 'string' },
        },
        required: ['clientCompanyId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_client_access',
      description:
        'Hinterlegt einen Zugang/ein Passwort bei einem Kunden (verschlüsselt gespeichert). Für „hier ist ein Passwort von Kunde XY".',
      parameters: {
        type: 'object',
        properties: {
          clientCompanyId: { type: 'string' },
          title: { type: 'string', description: 'z. B. „WordPress-Login"' },
          username: { type: 'string' },
          secret: { type: 'string', description: 'das Passwort' },
          url: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['clientCompanyId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_membership_module',
      description:
        'Aktiviert oder deaktiviert ein Modul in der Mitgliedschaft eines Kunden (Baukasten). Für „ein Modul weniger ab sofort".',
      parameters: {
        type: 'object',
        properties: {
          clientCompanyId: { type: 'string' },
          moduleQuery: { type: 'string', description: 'Name oder Schlüssel des Moduls' },
          enabled: { type: 'boolean', description: 'true = aktivieren, false = entfernen' },
          immediately: { type: 'boolean', description: 'sofort gültig (Standard) statt zum Folgemonat' },
        },
        required: ['clientCompanyId', 'moduleQuery', 'enabled'],
      },
    },
  },
] as const;

// --- Executor -------------------------------------------------------------

type Json = Record<string, unknown>;

async function agencyOrgId(): Promise<string> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) throw new Error('Kein Agentur-Kontext.');
  return orgId;
}

function fd(entries: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v != null) f.set(k, v);
  return f;
}

/** Runs one tool call and returns a short text result for the model. */
export async function executeAssistantTool(
  name: string,
  args: Json,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const orgId = await agencyOrgId();
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);

  switch (name) {
    case 'find_client': {
      const like = `%${String(args.query ?? '').trim()}%`;
      const { data } = await supabase
        .from('client_companies')
        .select('id, name')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .ilike('name', like)
        .limit(10);
      return JSON.stringify(
        (data ?? []).map((c) => ({ clientCompanyId: c.id, name: c.name })),
      );
    }
    case 'find_team_member': {
      const q = String(args.query ?? '').trim().toLowerCase();
      const { data: members } = await supabase
        .from('memberships')
        .select('user_id, role')
        .eq('organization_id', orgId)
        .eq('status', 'active');
      const ids = (members ?? [])
        .filter((m) => m.role !== 'client')
        .map((m) => m.user_id);
      if (ids.length === 0) return '[]';
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      const hits = (profiles ?? [])
        .filter((p) => (p.full_name ?? '').toLowerCase().includes(q))
        .map((p) => ({ userId: p.id, name: p.full_name ?? 'Unbekannt' }));
      return JSON.stringify(hits);
    }
    case 'list_client_projects': {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('client_company_id', s('clientCompanyId') ?? '')
        .order('created_at', { ascending: true });
      return JSON.stringify(
        (data ?? []).map((p) => ({ projectId: p.id, name: p.name })),
      );
    }
    case 'find_task': {
      const like = `%${String(args.query ?? '').trim()}%`;
      let query = supabase
        .from('tasks')
        .select('id, title, project_id')
        .eq('organization_id', orgId)
        .ilike('title', like)
        .limit(10);
      const clientId = s('clientCompanyId');
      if (clientId) {
        const { data: projs } = await supabase
          .from('projects')
          .select('id')
          .eq('organization_id', orgId)
          .eq('client_company_id', clientId);
        const pids = (projs ?? []).map((p) => p.id);
        if (pids.length === 0) return '[]';
        query = query.in('project_id', pids);
      }
      const { data } = await query;
      return JSON.stringify(
        (data ?? []).map((t) => ({ taskId: t.id, title: t.title, projectId: t.project_id })),
      );
    }
    case 'create_task': {
      const projectId = s('projectId') ?? '';
      const { data: board } = await supabase
        .from('boards')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();
      if (!board) return 'Kein Board zu diesem Projekt gefunden.';
      const { data: col } = await supabase
        .from('board_columns')
        .select('id')
        .eq('board_id', board.id)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!col) return 'Keine Spalte im Board gefunden.';
      const res = await createTaskAction(
        idleResult,
        fd({
          projectId,
          columnId: col.id,
          title: s('title'),
          description: s('description'),
          priority: s('priority') ?? 'medium',
          isInternal: 'true',
        }),
      );
      if (res.status !== 'success') return `Fehler: ${errMsg(res)}`;
      const assignee = s('assigneeUserId');
      if (assignee) {
        const { data: t } = await supabase
          .from('tasks')
          .select('id')
          .eq('project_id', projectId)
          .eq('title', s('title') ?? '')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (t) {
          await assignTaskAction(idleResult, fd({ projectId, taskId: t.id, userId: assignee }));
          return `Aufgabe „${s('title')}" angelegt und zugewiesen.`;
        }
      }
      return `Aufgabe „${s('title')}" angelegt.`;
    }
    case 'reassign_task': {
      const projectId = s('projectId') ?? '';
      const taskId = s('taskId') ?? '';
      const from = s('fromUserId');
      if (from) {
        await unassignTaskAction(idleResult, fd({ projectId, taskId, userId: from }));
      }
      const res = await assignTaskAction(
        idleResult,
        fd({ projectId, taskId, userId: s('toUserId') }),
      );
      return res.status === 'success' ? 'Aufgabe neu zugewiesen.' : `Fehler: ${errMsg(res)}`;
    }
    case 'create_client': {
      const res = await createClientCompanyAction(
        idleResult,
        fd({
          orgId,
          name: s('name'),
          contactEmail: s('contactEmail'),
          notes: s('notes'),
          customerType: 'supevo',
        }),
      );
      const id = (resData(res) as { id?: string }).id;
      return res.status === 'success'
        ? `Kunde „${s('name')}" angelegt${id ? ` (clientCompanyId ${id})` : ''}.`
        : `Fehler: ${errMsg(res)}`;
    }
    case 'update_client_contact': {
      const res = await updateClientProfileAction(
        idleResult,
        fd({
          orgId,
          clientCompanyId: s('clientCompanyId'),
          contactEmail: s('contactEmail'),
          industry: s('industry'),
          brands: s('brands'),
          interests: s('interests'),
          expressTicketsPerMonth: '0',
        }),
      );
      return res.status === 'success' ? 'Kontaktdaten gespeichert.' : `Fehler: ${errMsg(res)}`;
    }
    case 'set_client_address': {
      const clientCompanyId = s('clientCompanyId') ?? '';
      const m = await getClientMembership(clientCompanyId);
      if (!m) return 'Der Kunde hat noch keine Mitgliedschaft – bitte zuerst das Onboarding/die Mitgliedschaft anlegen.';
      // Bestehende Abrechnungswerte beibehalten, nur die genannten Felder überschreiben.
      const res = await saveMembershipBillingAction(
        idleResult,
        fd({
          orgId,
          clientCompanyId,
          interval_months: String(m.interval_months ?? 1),
          billing_day: String(m.billing_day ?? 1),
          payment_method: m.payment_method ?? 'sepa',
          status: m.status ?? 'active',
          start_date: m.start_date ?? new Date().toISOString().slice(0, 10),
          auto_send: m.auto_send ? 'true' : 'false',
          mandate_reference: m.mandate_reference ?? '',
          mandate_date: m.mandate_date ?? '',
          debtor_iban: s('iban') ?? m.debtor_iban ?? '',
          debtor_bic: s('bic') ?? m.debtor_bic ?? '',
          billing_name: s('billingName') ?? m.billing_name ?? '',
          billing_address_line1: s('addressLine1') ?? m.billing_address_line1 ?? '',
          billing_address_line2: s('addressLine2') ?? m.billing_address_line2 ?? '',
          billing_postal_code: s('postalCode') ?? m.billing_postal_code ?? '',
          billing_city: s('city') ?? m.billing_city ?? '',
          billing_country: s('country') ?? m.billing_country ?? 'Deutschland',
          billing_vat_id: s('vatId') ?? m.billing_vat_id ?? '',
        }),
      );
      return res.status === 'success' ? 'Adresse/SEPA gespeichert.' : `Fehler: ${errMsg(res)}`;
    }
    case 'add_client_access': {
      const res = await addAssetLinkAction(
        idleResult,
        fd({
          clientCompanyId: s('clientCompanyId'),
          category: 'access',
          title: s('title'),
          username: s('username'),
          url: s('url'),
          notes: s('notes'),
          secret: s('secret'),
        }),
      );
      return res.status === 'success' ? 'Zugang hinterlegt.' : `Fehler: ${errMsg(res)}`;
    }
    case 'set_membership_module': {
      const clientCompanyId = s('clientCompanyId') ?? '';
      const view = await getMembershipConfigurator(clientCompanyId);
      if (!view) return 'Keine Mitgliedschaft/Konfigurator für diesen Kunden gefunden.';
      const q = String(args.moduleQuery ?? '').trim().toLowerCase();
      const mod = view.modules.find(
        (d) => d.key.toLowerCase() === q || d.label.toLowerCase().includes(q),
      );
      if (!mod) return `Modul „${args.moduleQuery}" nicht gefunden.`;
      const enabled = args.enabled === true;
      const current = view.active.selections.filter((sel) => sel.id !== mod.key);
      const selections = [...current, { id: mod.key, enabled }];
      const res = await saveMembershipConfigAction({
        clientCompanyId,
        stage: view.active.stage === 2 ? 2 : 1,
        selections,
        applyImmediately: args.immediately !== false,
        redeemedPromotions:
          (view as { redeemedPromotions?: string[] }).redeemedPromotions ?? [],
      });
      return res.status === 'success'
        ? `Modul „${mod.label}" ${enabled ? 'aktiviert' : 'entfernt'}.`
        : `Fehler: ${errMsg(res)}`;
    }
    default:
      return `Unbekanntes Werkzeug: ${name}`;
  }
}
