import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';
import {
  fetchUnseen,
  markSeen,
  isImapConfigured,
  type InboundMessage,
} from '@/lib/inbound/imap';
import { parseInquiryEmail, classifyInquiry } from '@/features/inquiries/ai-parse';

export interface InboundResult {
  skipped?: string;
  fetched: number;
  matched: number;
  spam: number;
  quarantined: number;
}

/** Kandidaten-Tokens = Local-Parts aller Empfänger auf unserer Inbound-Domain. */
function candidateTokens(recipients: string[], domain: string): string[] {
  const suffix = `@${domain.toLowerCase()}`;
  return [
    ...new Set(
      recipients
        .filter((r) => r.endsWith(suffix))
        .map((r) => r.slice(0, -suffix.length))
        .filter(Boolean),
    ),
  ];
}

async function quarantine(
  service: ReturnType<typeof createSupabaseServiceClient>,
  msg: InboundMessage,
  reason: string,
  organizationId: string | null,
): Promise<void> {
  // message_id ist unique → doppelte Läufe legen nichts doppelt ab.
  await service
    .from('inbound_quarantine')
    .upsert(
      {
        organization_id: organizationId,
        reason,
        from_address: msg.from,
        to_addresses: msg.recipients,
        subject: msg.subject || null,
        body: msg.text ? msg.text.slice(0, 8000) : null,
        message_id: msg.messageId,
      },
      { onConflict: 'message_id', ignoreDuplicates: true },
    );
}

/**
 * Holt neue Mails aus dem Catch-all-Postfach und legt sie als Anfragen ab.
 * Zuordnung ausschließlich über den exakten, aktiven Token (fail-closed):
 * genau ein Treffer → Kunde; sonst → Quarantäne. Die KI markiert nur Spam und
 * liest Felder aus – sie beeinflusst die Zuordnung nie.
 */
export async function processInboundEmails(): Promise<InboundResult> {
  const domain = process.env.INBOUND_DOMAIN;
  if (!isImapConfigured() || !domain) {
    return { skipped: 'not-configured', fetched: 0, matched: 0, spam: 0, quarantined: 0 };
  }

  const service = createSupabaseServiceClient();
  const messages = await fetchUnseen(50);
  const done: number[] = [];
  let matched = 0;
  let spam = 0;
  let quarantined = 0;

  for (const msg of messages) {
    try {
      const candidates = candidateTokens(msg.recipients, domain);

      // Aktive Endpoints zu den Kandidaten-Tokens laden.
      const { data: endpoints } = candidates.length
        ? await service
            .from('inquiry_endpoints')
            .select('token, client_company_id, organization_id, enabled')
            .in('token', candidates)
            .eq('enabled', true)
        : { data: [] as { token: string; client_company_id: string; organization_id: string; enabled: boolean }[] };

      const distinctClients = [
        ...new Map(
          (endpoints ?? []).map((e) => [e.client_company_id, e] as const),
        ).values(),
      ];

      if (distinctClients.length === 0) {
        await quarantine(service, msg, 'no_token', null);
        quarantined++;
        done.push(msg.uid);
        continue;
      }
      if (distinctClients.length > 1) {
        // Niemals raten – mehrere Kunden in einer Mail → Quarantäne.
        await quarantine(service, msg, 'multiple_tokens', distinctClients[0]!.organization_id);
        quarantined++;
        done.push(msg.uid);
        continue;
      }

      const target = distinctClients[0]!;
      const parsed = await parseInquiryEmail(msg.subject, msg.text);
      const cls = await classifyInquiry(parsed.subject, parsed.message);

      const { data: inquiry } = await service
        .from('web_inquiries')
        .insert({
          organization_id: target.organization_id,
          client_company_id: target.client_company_id,
          category: cls.category,
          ai_urgency: cls.urgency,
          ai_potential: cls.potential,
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          subject: parsed.subject,
          message: parsed.message,
          source: 'E-Mail',
          payload: {
            channel: 'email',
            from: msg.from,
            messageId: msg.messageId,
            raw: msg.text.slice(0, 8000),
          },
          is_spam: parsed.isSpam,
          spam_reason: parsed.spamReason,
        } as never)
        .select('id')
        .maybeSingle();

      matched++;
      if (parsed.isSpam) spam++;

      // Kontakte nur bei echten Anfragen benachrichtigen (kein Spam).
      if (!parsed.isSpam) {
        const { data: contacts } = await service
          .from('client_contacts')
          .select('user_id')
          .eq('client_company_id', target.client_company_id);
        const recipientIds = [...new Set((contacts ?? []).map((c) => c.user_id))];
        if (recipientIds.length > 0) {
          await createNotifications(
            recipientIds.map((recipientId) => ({
              organizationId: target.organization_id,
              recipientId,
              type: 'inquiry' as const,
              title: 'Neue Anfrage (E-Mail)',
              body: parsed.name
                ? `Von ${parsed.name}${parsed.subject ? ` – ${parsed.subject}` : ''}`
                : 'Neue Anfrage über euren Funnel.',
              entityType: 'inquiry',
              entityId: inquiry?.id ?? null,
            })),
          );
        }
      }

      done.push(msg.uid);
    } catch (e) {
      // Fehler bei EINER Mail: nicht als seen markieren → nächster Lauf erneut.
      logger.warn('inbound.process.msg_failed', { error: (e as Error).message });
    }
  }

  try {
    await markSeen(done);
  } catch (e) {
    logger.warn('inbound.markseen_failed', { error: (e as Error).message });
  }

  return { fetched: messages.length, matched, spam, quarantined };
}
