import 'server-only';
import webpush from 'web-push';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

/**
 * Web-Push-Versand (VAPID). Die Schlüssel kommen aus den Umgebungsvariablen
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (und optional VAPID_SUBJECT als
 * mailto:-Kontakt). Ohne konfigurierte Schlüssel ist der Versand ein No-op.
 */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@supevo.de',
    pub,
    priv,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Sendet eine Push-Nachricht an alle Geräte eines Nutzers. Best-effort: Fehler
 * werden geloggt, abgelaufene Abos (404/410) werden entfernt. Blockiert nie den
 * Aufrufer.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const service = createSupabaseServiceClient();
  const { data: subs } = await service
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/app',
    tag: payload.tag,
  });

  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(s.endpoint);
        } else {
          logger.warn('push.send.failed', { status: status ?? 'unknown' });
        }
      }
    }),
  );

  if (stale.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', stale);
  }
}

/** Fan-out an mehrere Empfänger (dedupliziert). */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((id) => sendPushToUser(id, payload)));
}
