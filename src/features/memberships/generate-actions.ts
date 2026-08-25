'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/session';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { generateOfferDelivery } from './generate-offer';

/**
 * Agentur: erzeugt aus dem gespeicherten Angebot (Modulauswahl) des Kunden
 * Marketingplan-Maßnahmen und Aufgaben (Warteschlange + wiederkehrend). Nur mit
 * supevo-Basis. Auslösung per Knopf auf der Kundenseite.
 */
export async function generateOfferDeliveryAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const res = await generateOfferDelivery(orgId, clientCompanyId, user.id);
  if ('error' in res) return errorResult(res.error);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  const parts: string[] = [];
  if (res.planItems > 0) parts.push(`${res.planItems} Marketingplan-Maßnahme(n)`);
  if (res.queueTasks > 0) parts.push(`${res.queueTasks} Warteschlangen-Aufgabe(n)`);
  if (res.recurringTasks > 0)
    parts.push(`${res.recurringTasks} wiederkehrende Aufgabe(n)`);
  if (parts.length === 0) {
    return successResult('Nichts Neues zu erzeugen (bereits vorhanden).');
  }
  const skippedNote =
    res.skipped.length > 0 ? ` (${res.skipped.length} bereits vorhanden übersprungen)` : '';
  return successResult(`Erzeugt: ${parts.join(', ')}.${skippedNote}`);
}
