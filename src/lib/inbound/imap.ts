import 'server-only';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * IMAP-Abruf für den Anfragen-Eingang. Verbindet sich mit dem Catch-all-Postfach
 * (Zugangsdaten aus Umgebungsvariablen), liest die ungelesenen Mails, parst sie
 * und markiert sie nach erfolgreicher Verarbeitung als gelesen.
 *
 * Erwartete ENV: INBOUND_IMAP_HOST, INBOUND_IMAP_PORT (Standard 993),
 * INBOUND_IMAP_USER, INBOUND_IMAP_PASSWORD.
 */

export interface InboundMessage {
  uid: number;
  messageId: string | null;
  from: string | null;
  /** Alle Empfänger-Adressen (To/Cc + Delivered-To/X-Original-To/X-Envelope-To). */
  recipients: string[];
  subject: string;
  text: string;
}

export function isImapConfigured(): boolean {
  return Boolean(
    process.env.INBOUND_IMAP_HOST &&
      process.env.INBOUND_IMAP_USER &&
      process.env.INBOUND_IMAP_PASSWORD,
  );
}

function imapClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.INBOUND_IMAP_HOST ?? '',
    port: Number(process.env.INBOUND_IMAP_PORT) || 993,
    secure: true,
    auth: {
      user: process.env.INBOUND_IMAP_USER ?? '',
      pass: process.env.INBOUND_IMAP_PASSWORD ?? '',
    },
    logger: false,
  });
}

function addrList(
  value: { value?: { address?: string | null }[] } | undefined,
): string[] {
  return (value?.value ?? [])
    .map((a) => (a.address ?? '').toLowerCase().trim())
    .filter(Boolean);
}

/** Header-Zeilen wie "Delivered-To"/"X-Original-To" (können mehrfach vorkommen). */
function headerAddrs(
  headerLines: readonly { key: string; line: string }[],
  keys: string[],
): string[] {
  const out: string[] = [];
  for (const h of headerLines) {
    if (!keys.includes(h.key.toLowerCase())) continue;
    const m = h.line.match(/[\w.+-]+@[\w.-]+/g);
    if (m) out.push(...m.map((s) => s.toLowerCase()));
  }
  return out;
}

/**
 * Holt bis zu `max` ungelesene Nachrichten. Öffnet die Verbindung, liest, und
 * schließt sie wieder – nichts läuft dauerhaft.
 */
export async function fetchUnseen(max = 50): Promise<InboundMessage[]> {
  const client = imapClient();
  await client.connect();
  const out: InboundMessage[] = [];
  const lock = await client.getMailboxLock('INBOX');
  try {
    let count = 0;
    for await (const msg of client.fetch(
      { seen: false },
      { uid: true, source: true },
    )) {
      if (count >= max) break;
      count++;
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        const recipients = [
          ...addrList(parsed.to as never),
          ...addrList(parsed.cc as never),
          ...headerAddrs(parsed.headerLines ?? [], [
            'delivered-to',
            'x-original-to',
            'x-envelope-to',
            'envelope-to',
          ]),
        ];
        out.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? null,
          from: parsed.from?.value?.[0]?.address?.toLowerCase() ?? null,
          recipients: [...new Set(recipients)],
          subject: parsed.subject ?? '',
          text: parsed.text ?? (typeof parsed.html === 'string' ? parsed.html : ''),
        });
      } catch {
        /* eine unparsbare Mail überspringen, aber nicht als seen markieren */
      }
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return out;
}

/** Markiert verarbeitete Nachrichten als gelesen, damit sie nicht erneut kommen. */
export async function markSeen(uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const client = imapClient();
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    await client.messageFlagsAdd(uids.join(','), ['\\Seen'], { uid: true });
  } finally {
    lock.release();
  }
  await client.logout();
}
