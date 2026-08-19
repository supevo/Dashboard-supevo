'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

// data-URI eines PNG/JPG/SVG-Bildes; Größe begrenzt (data-URI-Länge).
const schema = z.object({
  variant: z.enum(['dark', 'light']),
  // ~700 KB base64 ≈ 512 KB Rohbild – für ein Logo mehr als genug.
  dataUri: z
    .string()
    .max(700_000)
    .regex(
      /^data:image\/(png|jpeg|jpg|svg\+xml);base64,/,
      'Bitte ein PNG-, JPG- oder SVG-Bild hochladen.',
    )
    .or(z.literal('')),
});

/**
 * Speichert (oder entfernt) eine Logo-Variante der Org. Nur Org-Admins.
 * dataUri leer = Variante zurücksetzen (Standard-Logo greift wieder).
 * Hinweis: Für Rechnungen (PDF) muss das DUNKLE Logo ein PNG/JPG sein – SVG kann
 * pdf-lib nicht einbetten (SVG wird dort ignoriert).
 */
export async function setOrgLogoAction(input: {
  variant: string;
  dataUri: string;
}): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.dataUri?.[0] ?? de.errors.VALIDATION,
    );
  }
  const { variant, dataUri } = parsed.data;

  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const column = variant === 'dark' ? 'logo_dark' : 'logo_light';
  const value = dataUri === '' ? null : dataUri;

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('org_branding')
    .upsert(
      { organization_id: orgId, [column]: value } as never,
      { onConflict: 'organization_id' },
    );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  revalidatePath('/', 'layout');
  return successResult(
    dataUri === '' ? 'Logo zurückgesetzt.' : 'Logo gespeichert.',
  );
}
