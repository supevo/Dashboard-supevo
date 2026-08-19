'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

type Service = ReturnType<typeof createSupabaseServiceClient>;

/** Sucht einen Auth-User anhand seiner E-Mail (paginiert). */
async function findAuthUserByEmail(
  service: Service,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { id: match.id };
    if (data.users.length < perPage) break;
  }
  return null;
}

/** Deterministische E-Mail des Backup-Zugangs einer Kundenfirma. */
function backupEmail(clientCompanyId: string): string {
  return `backup+${clientCompanyId}@supevo.de`;
}

/** Kräftiges Zufallspasswort (URL-sicher, ~19 Zeichen). */
function generatePassword(): string {
  return randomBytes(14).toString('base64url');
}

/**
 * Erstellt (oder rotiert) einen dedizierten Backup-Portalzugang für eine
 * Kundenfirma. Nur Super-Admins. Der Zugang ist ein echter Kunden-Kontakt der
 * Firma – dadurch greifen alle RLS-Regeln wie beim echten Kunden. Das Passwort
 * wird EINMALIG zurückgegeben (nicht gespeichert); erneuter Aufruf setzt ein
 * neues Passwort.
 */
export async function createBackupLoginAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!isSuperAdmin(user)) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('id, name, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.NOT_FOUND);

  const email = backupEmail(clientCompanyId);
  const password = generatePassword();
  const fullName = `Backup-Zugang – ${company.name}`;

  // Konto anlegen; existiert es bereits (erneuter Aufruf), Passwort neu setzen.
  let userId: string;
  const { data: created } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    const existing = await findAuthUserByEmail(service, email);
    if (!existing) return errorResult(de.errors.INTERNAL);
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) return errorResult(de.errors.INTERNAL);
    userId = existing.id;
  }

  await service
    .from('profiles')
    .upsert({ id: userId, full_name: fullName, email }, { onConflict: 'id' });
  await service.from('memberships').upsert(
    {
      user_id: userId,
      organization_id: company.organization_id,
      role: 'client',
      status: 'active',
    },
    { onConflict: 'user_id,organization_id' },
  );
  const { data: existingContact } = await service
    .from('client_contacts')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existingContact) {
    await service.from('client_contacts').insert({
      organization_id: company.organization_id,
      client_company_id: clientCompanyId,
      user_id: userId,
    });
  }

  await logActivity({
    actorId: user.id,
    organizationId: company.organization_id,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
    metadata: { backupLogin: true },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Backup-Zugang bereit.', { email, password });
}
