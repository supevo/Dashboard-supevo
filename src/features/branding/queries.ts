import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface OrgBranding {
  /** Dunkles Logo für HELLE Hintergründe (Rechnung/Vertrag, Light-UI). */
  logoDark: string | null;
  /** Helles Logo für DUNKLE Hintergründe (Dark-UI). */
  logoLight: string | null;
}

const EMPTY: OrgBranding = { logoDark: null, logoLight: null };

/**
 * Lädt das hinterlegte Org-Logo (data-URIs). Service-Client, damit es überall
 * (Header für Agentur + Kunden, PDF-Erzeugung) unabhängig von RLS funktioniert.
 * Nie werfend – ohne Branding/Tabelle kommen die Standard-Assets zum Zug.
 */
export async function getOrgBranding(orgId: string): Promise<OrgBranding> {
  try {
    const { data } = await createSupabaseServiceClient()
      .from('org_branding')
      .select('logo_dark, logo_light')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!data) return EMPTY;
    return {
      logoDark: (data as { logo_dark: string | null }).logo_dark ?? null,
      logoLight: (data as { logo_light: string | null }).logo_light ?? null,
    };
  } catch {
    return EMPTY;
  }
}
