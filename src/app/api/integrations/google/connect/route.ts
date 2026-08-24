import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  buildAuthUrl,
  isGoogleConfigured,
  signState,
} from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';

/**
 * Startet den Google-OAuth-Flow für einen Kunden: prüft die Berechtigung,
 * dass der Kunde zur eigenen Org gehört, und leitet zur Google-Zustimmung
 * weiter. Der State (signierte client_company_id) schützt den Callback.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  if (!isGoogleConfigured()) {
    return new NextResponse(
      'Google-Integration ist nicht konfiguriert (GOOGLE_CLIENT_ID/SECRET fehlen).',
      { status: 503 },
    );
  }
  const orgId = primaryAgencyOrgId(user);
  const clientId = request.nextUrl.searchParams.get('client');
  if (!orgId || !clientId) {
    return new NextResponse('client fehlt', { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!company || company.organization_id !== orgId) {
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.redirect(buildAuthUrl(signState(clientId)));
}
