import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { decryptSecret } from '@/lib/crypto/secret-vault';
import {
  accessTokenFromRefresh,
  querySearchAnalytics,
  type SearchQueryRow,
} from '@/lib/integrations/google';

const PROVIDER = 'google_search_console';

export interface IntegrationStatusRow {
  clientCompanyId: string;
  clientName: string;
  connected: boolean;
  siteUrl: string | null;
}

/**
 * Verbindungsstatus je Kunde (Search Console). Zugriff über den Service-Client;
 * der Aufrufer muss zuvor Agentur-Zugriff auf die Org geprüft haben.
 */
export async function listIntegrationStatus(
  orgId: string,
): Promise<IntegrationStatusRow[]> {
  const service = createSupabaseServiceClient();
  const [{ data: companies }, { data: integrations }] = await Promise.all([
    service
      .from('client_companies')
      .select('id, name')
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    service
      .from('client_integrations')
      .select('client_company_id, site_url, refresh_token_enc')
      .eq('organization_id', orgId)
      .eq('provider', PROVIDER),
  ]);

  const byClient = new Map(
    (integrations ?? []).map((i) => [i.client_company_id, i] as const),
  );

  return (companies ?? [])
    .map((c) => {
      const integ = byClient.get(c.id);
      return {
        clientCompanyId: c.id,
        clientName: c.name,
        connected: Boolean(integ?.refresh_token_enc),
        siteUrl: integ?.site_url ?? null,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'de'));
}

export type SnapshotResult =
  | { ok: true; siteUrl: string | null; rows: SearchQueryRow[] }
  | { ok: false; error: string };

/**
 * Live-Abruf der Top-Suchanfragen (letzte 28 Tage) für einen Kunden. Entschlüs-
 * selt den Refresh-Token, holt einen frischen Access-Token und fragt die
 * Search-Console-API. Der Aufrufer muss Agentur-Zugriff auf die Org des Kunden
 * geprüft haben (siehe actions.ts).
 */
export async function getSearchConsoleSnapshot(
  clientCompanyId: string,
  orgId: string,
): Promise<SnapshotResult> {
  const service = createSupabaseServiceClient();
  const { data: integ } = await service
    .from('client_integrations')
    .select('refresh_token_enc, site_url')
    .eq('organization_id', orgId)
    .eq('client_company_id', clientCompanyId)
    .eq('provider', PROVIDER)
    .maybeSingle();

  if (!integ?.refresh_token_enc) {
    return { ok: false, error: 'Nicht verbunden.' };
  }
  const refresh = decryptSecret(integ.refresh_token_enc);
  if (!refresh) {
    return { ok: false, error: 'Token konnte nicht entschlüsselt werden (Schlüssel?).' };
  }
  if (!integ.site_url) {
    return { ok: false, error: 'Keine verifizierte Property gefunden.' };
  }
  const accessToken = await accessTokenFromRefresh(refresh);
  if (!accessToken) {
    return { ok: false, error: 'Google lehnte den Token ab – bitte neu verbinden.' };
  }
  const rows = await querySearchAnalytics(accessToken, integ.site_url, 28, 25);
  return { ok: true, siteUrl: integ.site_url, rows };
}
