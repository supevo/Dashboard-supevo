'use server';

import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/** Constant-time check of the master action password (env MASTER_ACTION_PASSWORD). */
function masterPasswordOk(input: string): boolean {
  const secret = process.env.MASTER_ACTION_PASSWORD ?? '';
  if (!secret || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
function masterConfigured(): boolean {
  return Boolean(process.env.MASTER_ACTION_PASSWORD);
}

const clientSchema = z.object({
  clientCompanyId: z.string().uuid(),
  password: z.string().min(1).max(200),
});

/**
 * Löscht einen Kunden UNWIDERRUFLICH inkl. Projekte, Aufgaben, Rechnungen,
 * Zeiten usw. Nur Super-Admin + korrektes Master-Passwort. Läuft über eine
 * atomare DB-Funktion (Service-Client).
 */
export async function purgeClientAction(input: unknown): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);
  if (!masterConfigured()) {
    return errorResult('Master-Passwort ist nicht konfiguriert (MASTER_ACTION_PASSWORD).');
  }
  if (!masterPasswordOk(parsed.data.password)) {
    return errorResult('Master-Passwort ist falsch.');
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('purge_client_company', {
    p_client: parsed.data.clientCompanyId,
  });
  if (error) {
    logger.error('purge.client.failed', {
      clientCompanyId: parsed.data.clientCompanyId,
      error: error.message,
    });
    return errorResult('Löschen fehlgeschlagen: ' + error.message);
  }

  revalidatePath('/app/clients');
  return successResult('Kunde wurde endgültig gelöscht.');
}

const memberSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  password: z.string().min(1).max(200),
});

/**
 * Entfernt einen Mitarbeiter aus der Organisation und löscht seine Arbeitszeit-/
 * Zeiterfassungsdaten dieser Org. Der Login-Account bleibt bestehen. Nur
 * Super-Admin + korrektes Master-Passwort.
 */
export async function purgeMemberAction(input: unknown): Promise<ActionResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);
  if (parsed.data.userId === user.id) {
    return errorResult('Du kannst dich nicht selbst entfernen.');
  }
  if (!masterConfigured()) {
    return errorResult('Master-Passwort ist nicht konfiguriert (MASTER_ACTION_PASSWORD).');
  }
  if (!masterPasswordOk(parsed.data.password)) {
    return errorResult('Master-Passwort ist falsch.');
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('purge_org_member', {
    p_user: parsed.data.userId,
    p_org: parsed.data.orgId,
  });
  if (error) {
    logger.error('purge.member.failed', {
      userId: parsed.data.userId,
      error: error.message,
    });
    return errorResult('Entfernen fehlgeschlagen: ' + error.message);
  }

  revalidatePath('/app/team');
  return successResult('Mitarbeiter wurde entfernt und Testdaten zurückgesetzt.');
}
