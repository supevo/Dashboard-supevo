import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { aiSelfTest } from '@/lib/ai/complete';

/**
 * Verifies that SUPABASE_SERVICE_ROLE_KEY is really the service/secret key.
 * The admin auth API only works with a true service-role key; a publishable/
 * anon key returns an error here. This is the same privilege the invitation
 * lookup and other server-only features depend on.
 */
async function checkServiceKey(): Promise<{ ok: boolean; message: string }> {
  try {
    const service = createSupabaseServiceClient();
    const { error } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Service-Schlüssel funktioniert.' };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unbekannter Fehler',
    };
  }
}

/**
 * Support/diagnostics page: shows the app-side and DB-side view of the current
 * account, so role/membership mismatches (a frequent cause of RLS write errors)
 * can be confirmed at a glance.
 */
export default async function DiagnosticsPage() {
  const { user } = await requireAgencyPage();

  const supabase = await createSupabaseServerClient();
  const { data: dbView, error } = await supabase.rpc('whoami');
  const serviceKey = await checkServiceKey();
  const ai = await aiSelfTest();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Diagnose</h1>

      <Card>
        <CardHeader>
          <CardTitle>Service-Schlüssel (Server)</CardTitle>
        </CardHeader>
        <CardContent>
          {serviceKey.ok ? (
            <p className="text-sm font-medium text-emerald-600">
              ✅ {serviceKey.message}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              ❌ Service-Schlüssel funktioniert nicht: {serviceKey.message}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Muss grün sein, damit Einladungen, Profilbilder und das KI-Briefing
            funktionieren. Fehlerhaft = in Vercel ist unter{' '}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> nicht der geheime
            Service-/Secret-Schlüssel (<code>sb_secret_…</code>) hinterlegt.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KI (Morgen-Briefing)</CardTitle>
        </CardHeader>
        <CardContent>
          {ai.ok ? (
            <p className="text-sm font-medium text-emerald-600">
              ✅ KI erreichbar über {ai.provider} ({ai.model}). Antwort:{' '}
              {`„${ai.sample}“`}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              ❌ KI-Aufruf fehlgeschlagen
              {ai.provider ? ` (${ai.provider}${ai.model ? `, ${ai.model}` : ''})` : ''}
              : {ai.error}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Muss grün sein, damit das Morgen-Briefing Text erzeugt. Rot = der
            KI-Schlüssel (<code>GEMINI_API_KEY</code>) fehlt/ist ungültig, das
            Modell (<code>AI_MODEL</code>) ist nicht verfügbar, oder ein Kontingent
            ist erschöpft.
          </p>
        </CardContent>
      </Card>

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
