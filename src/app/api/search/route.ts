import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
}

export interface SearchResponse {
  clients: SearchHit[];
  projects: SearchHit[];
  tasks: SearchHit[];
  leads: SearchHit[];
  invoices: SearchHit[];
  colleagues: SearchHit[];
}

const EMPTY: SearchResponse = {
  clients: [],
  projects: [],
  tasks: [],
  leads: [],
  invoices: [],
  colleagues: [],
};

/** Escapes PostgREST ilike wildcards in user input. */
function sanitize(q: string): string {
  return q.replace(/[%_,()]/g, ' ').trim();
}

/**
 * Global search across clients, projects, tasks, leads, invoices and
 * colleagues (RLS-scoped, agency staff only). Each group is capped so the
 * palette stays scannable.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const q = sanitize(raw);
  if (q.length < 2) {
    return NextResponse.json(EMPTY);
  }
  const like = `%${q}%`;
  const orgId = primaryAgencyOrgId(user);

  const supabase = await createSupabaseServerClient();
  const [clientsRes, projectsRes, tasksRes, leadsRes, invoicesRes, memberRes] =
    await Promise.all([
      supabase.from('client_companies').select('id, name').ilike('name', like).limit(6),
      supabase.from('projects').select('id, name').ilike('name', like).limit(6),
      supabase
        .from('tasks')
        .select('id, title, project_id')
        .ilike('title', like)
        .is('deleted_at', null)
        .limit(8),
      supabase
        .from('leads')
        .select('id, contact_name, company')
        .or(`contact_name.ilike.${like},company.ilike.${like}`)
        .limit(6),
      supabase
        .from('invoices')
        .select('id, invoice_number, client_company_id')
        .ilike('invoice_number', like)
        .limit(6),
      // Kolleg:innen: nur aktive Mitglieder der eigenen Org (Profile werden
      // separat aufgelöst, damit die Suche org-übergreifend nichts preisgibt).
      orgId
        ? supabase
            .from('memberships')
            .select('user_id')
            .eq('organization_id', orgId)
            .eq('status', 'active')
        : Promise.resolve({ data: [] as { user_id: string }[] }),
    ]);

  const clients: SearchHit[] = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    sub: 'Kunde',
    href: `/app/clients/${c.id}`,
  }));
  const projects: SearchHit[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    sub: 'Projekt',
    href: `/app/projects/${p.id}`,
  }));
  const tasks: SearchHit[] = (tasksRes.data ?? []).map((t) => ({
    id: t.id,
    label: t.title,
    sub: 'Aufgabe',
    href: `/app/tasks/${t.id}`,
  }));
  const leads: SearchHit[] = (leadsRes.data ?? []).map((l) => ({
    id: l.id,
    label: l.company ? `${l.contact_name} · ${l.company}` : l.contact_name,
    sub: 'Lead',
    href: `/app/leads/${l.id}`,
  }));

  // Rechnungen: Kundennamen nachladen, damit der Treffer aussagekräftig ist.
  const invRows = invoicesRes.data ?? [];
  const invClientIds = [...new Set(invRows.map((i) => i.client_company_id))];
  const invClientNames = new Map<string, string>();
  if (invClientIds.length > 0) {
    const { data: cc } = await supabase
      .from('client_companies')
      .select('id, name')
      .in('id', invClientIds);
    for (const c of cc ?? []) invClientNames.set(c.id, c.name);
  }
  const invoices: SearchHit[] = invRows.map((i) => ({
    id: i.id,
    label: `Rechnung ${i.invoice_number ?? '—'}`,
    sub: invClientNames.get(i.client_company_id) ?? 'Rechnung',
    href: `/app/clients/${i.client_company_id}`,
  }));

  // Kolleg:innen: Profile der Org-Mitglieder per Namensfilter.
  let colleagues: SearchHit[] = [];
  const memberIds = (memberRes.data ?? []).map((m) => m.user_id);
  if (memberIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberIds)
      .ilike('full_name', like)
      .limit(6);
    colleagues = (profs ?? [])
      .filter((p) => p.full_name)
      .map((p) => ({
        id: p.id,
        label: p.full_name as string,
        sub: 'Kollege:in',
        href: `/app/team/${p.id}`,
      }));
  }

  return NextResponse.json({
    clients,
    projects,
    tasks,
    leads,
    invoices,
    colleagues,
  } satisfies SearchResponse);
}
