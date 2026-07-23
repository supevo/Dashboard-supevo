import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Support/diagnostics page: shows the app-side and DB-side view of the current
 * account, so role/membership mismatches (a frequent cause of RLS write errors)
 * can be confirmed at a glance.
 */
export default async function DiagnosticsPage() {
  const { user } = await requireAgencyPage();

  const supabase = await createSupabaseServerClient();
  const { data: dbView, error } = await supabase.rpc('whoami');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Diagnose</h1>

      <Card>
        <CardHeader>
          <CardTitle>App-Sicht (Session)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(
              {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                memberships: user.memberships,
              },
              null,
              2,
            )}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datenbank-Sicht (RLS / whoami)</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">
              whoami() nicht verfügbar – ist Migration 0009 eingespielt? ({error.message})
            </p>
          ) : (
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(dbView, null, 2)}
            </pre>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Für schreibende Aktionen (z. B. Projekt anlegen) muss die
            Datenbank-Sicht <code>is_super_admin: true</code> (oder eine aktive
            agency_admin-Mitgliedschaft) zeigen. Fehlt das, siehe
            <code> deploy/seed/repair-admin.sql</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
