import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { encryptSecret } from '@/lib/crypto/secret-vault';
import {
  accessTokenFromRefresh,
  exchangeCode,
  listSites,
  verifyState,
} from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';

function backTo(path: string, request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}

/**
 * Google-OAuth-Callback: tauscht den Code gegen Tokens, verschlüsselt den
 * Refresh-Token und speichert die Integration je Kunde. Bestimmt außerdem die
 * erste verifizierte Search-Console-Property als Standard.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  const sp = request.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  if (sp.get('error') || !code || !state || !orgId) {
    return backTo('/app/integrations?error=1', request);
  }

  const clientId = verifyState(state);
  if (!clientId) return backTo('/app/integrations?error=1', request);

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) {
    return new NextResponse(null, { status: 403 });
  }

  const tokens = await exchangeCode(code);
  if (!tokens?.refreshToken) {
    // Ohne refresh_token (z. B. bei Re-Auth ohne prompt=consent) können wir
    // nicht dauerhaft abrufen.
    return backTo('/app/integrations?error=norefresh', request);
  }

  const enc = encryptSecret(tokens.refreshToken);
  if (!enc) {
    // Ohne SECRET_ENCRYPTION_KEY würden wir Klartext-Tokens speichern – lieber
    // abbrechen.
    return backTo('/app/integrations?error=nokey', request);
  }

  // Erste verifizierte Property als Standard wählen.
  const sites = await listSites(tokens.accessToken);
  const siteUrl = sites[0] ?? null;

  await service
    .from('client_integrations')
    .upsert(
      {
        organization_id: orgId,
        client_company_id: clientId,
        provider: 'google_search_console',
        refresh_token_enc: enc,
        site_url: siteUrl,
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_company_id,provider' },
    );

  // Sanity-Check: einmal einen Access-Token ziehen (Fehler ignorieren).
  void accessTokenFromRefresh(tokens.refreshToken);

  return backTo('/app/integrations?connected=1', request);
}
