import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
}

/** Escapes PostgREST ilike wildcards in user input. */
function sanitize(q: string): string {
  return q.replace(/[%_,()]/g, ' ').trim();
}

/** Global search across clients, projects and tasks (RLS-scoped, agency). */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const q = sanitize(raw);
  if (q.length < 2) {
    return NextResponse.json({ clients: [], projects: [], tasks: [] });
  }
  const like = `%${q}%`;

  const supabase = await createSupabaseServerClient();
  const [clientsRes, projectsRes, tasksRes] = await Promise.all([
    supabase
      .from('client_companies')
      .select('id, name')
      .ilike('name', like)
      .limit(6),
    supabase.from('projects').select('id, name').ilike('name', like).limit(6),
    supabase
      .from('tasks')
      .select('id, title, project_id')
      .ilike('title', like)
      .is('deleted_at', null)
      .limit(8),
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

  return NextResponse.json({ clients, projects, tasks });
}
