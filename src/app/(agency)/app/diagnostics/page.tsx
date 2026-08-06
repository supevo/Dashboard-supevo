import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { aiSelfTest } from '@/lib/ai/complete';
import { listOneDriveUploadErrors } from '@/features/onedrive/queries';
import { formatBerlinDateTime } from '@/lib/time';

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

interface SchemaCheck {
  label: string;
  ok: boolean;
  hint: string;
}

/**
 * Verifies that the DB objects the app depends on actually exist – catches the
 * "code deployed but migration not run" drift (e.g. a missing function). Uses
 * the service client and reads Postgres error codes: 42P01 = table missing,
 * 42703 = column missing, 42883 = function missing.
 */
async function checkSchema(): Promise<SchemaCheck[]> {
  const service = createSupabaseServiceClient();
  const checks: SchemaCheck[] = [];

  const table = async (
    name: 'xp_events' | 'achievements' | 'user_counters',
    hint: string,
  ) => {
    const { error } = await service.from(name).select('*', { head: true, count: 'exact' }).limit(1);
    checks.push({ label: `Tabelle ${name}`, ok: !error || error.code !== '42P01', hint });
  };
  const column = async (
    tbl: 'memberships' | 'work_preferences',
    col: string,
    hint: string,
  ) => {
    const { error } = await service.from(tbl).select(col, { head: true }).limit(1);
    checks.push({ label: `Spalte ${tbl}.${col}`, ok: !error || error.code !== '42703', hint });
  };

  await table('xp_events', 'Migration 0047');
  await table('achievements', 'Migration 0048');
  await table('user_counters', 'Migration 0049/0050');
  await column('memberships', 'joined_company_at', 'Migration 0051');
  await column('work_preferences', 'level', 'Migration 0021/0046');

  // Function bump_counter (0050): service client → auth.uid() null → no-op, safe.
  const { error: fnErr } = await service.rpc('bump_counter', {
    p_key: '__diag__',
    p_org: '00000000-0000-0000-0000-000000000000',
  });
  checks.push({
    label: 'Funktion bump_counter()',
    ok: !fnErr || (fnErr.code !== '42883' && fnErr.code !== 'PGRST202'),
    hint: 'Migration 0050',
  });

  return checks;
}

/**
 * Support/diagnostics page: shows the app-side and DB-side view of the current
 * account, so role/membership mismatches (a frequent cause of RLS write errors)
 * can be confirmed at a glance.
 */
export default async function DiagnosticsPage() {
  const { user, orgId } = await requireAgencyPage();

  const supabase = await createSupabaseServerClient();
  const { data: dbView, error } = await supabase.rpc('whoami');
  const serviceKey = await checkServiceKey();
  const ai = await aiSelfTest();
  const schema = await checkSchema();
  const schemaOk = schema.every((c) => c.ok);
  const oneDriveErrors = isSuperAdmin(user)
    ? await listOneDriveUploadErrors(orgId)
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Diagnose</h1>

      {isSuperAdmin(user) && (
        <Card>
          <CardHeader>
            <CardTitle>☁️ OneDrive-Upload-Probleme</CardTitle>
          </CardHeader>
          <CardContent>
            {oneDriveErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Upload-Probleme. Alle Aufgaben-Anhänge wurden wie
                konfiguriert gespeichert.
              </p>
            ) : (
              <ul className="space-y-2">
                {oneDriveErrors.map((e) => (
                  <li key={e.id} className="rounded-md border p-2.5 text-sm">
                    <div className="font-medium text-amber-600 dark:text-amber-400">
                      {e.reason}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.fileName ? `${e.fileName} · ` : ''}
                      {formatBerlinDateTime(e.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

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
          <CardTitle>
            Datenbank-Schema {schemaOk ? '✅' : '⚠️'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {schema.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3">
                <span className={c.ok ? '' : 'text-destructive'}>
                  {c.ok ? '✅' : '❌'} {c.label}
                </span>
                {!c.ok && (
                  <span className="text-xs text-muted-foreground">{c.hint}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Alle grün = alle Migrationen eingespielt. Ein ❌ zeigt genau, welche
            Migration in Supabase noch fehlt.
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
