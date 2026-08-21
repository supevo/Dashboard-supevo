'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/authz/authorize';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { de } from '@/lib/i18n/de';

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(500).optional(),
});

/**
 * Speichert das Web-Push-Abo des aktuellen Geräts. Über den Service-Client
 * (recipient == self ist ok, aber die Tabelle ist deny-all per RLS). Idempotent
 * über den eindeutigen endpoint.
 */
export async function savePushSubscriptionAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };

  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const { error } = await service.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return { ok: false, error: de.errors.INTERNAL };
  return { ok: true };
}

/** Entfernt das Abo eines Geräts (beim Abmelden von Push). */
export async function deletePushSubscriptionAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  if (!z.string().url().safeParse(endpoint).success) return { ok: false };
  const user = await requireUser();
  const service = createSupabaseServiceClient();
  await service
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);
  return { ok: true };
}
