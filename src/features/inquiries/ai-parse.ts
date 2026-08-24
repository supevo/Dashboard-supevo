import 'server-only';
import { completeText, isAiEnabled } from '@/lib/ai/complete';

export interface ParsedInquiry {
  isSpam: boolean;
  spamReason: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string | null;
}

function firstMatch(re: RegExp, text: string): string | null {
  const m = text.match(re);
  return m ? (m[1] ?? m[0]).trim() : null;
}

/** Heuristik ohne KI: E-Mail/Telefon per Muster, Rest als Nachricht. */
function heuristicParse(subject: string, body: string): ParsedInquiry {
  const text = `${subject}\n${body}`;
  const email = firstMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/, text);
  const phone = firstMatch(/(\+?\d[\d\s()/-]{6,}\d)/, text);
  return {
    isSpam: false, // Ohne KI nichts vorschnell als Spam markieren.
    spamReason: null,
    name: null,
    email,
    phone,
    subject: subject || null,
    message: body.trim() ? body.trim().slice(0, 4000) : null,
  };
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  return s !== -1 && e > s ? raw.slice(s, e + 1) : raw;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : null;
}

/**
 * Liest aus einer eingegangenen Funnel-/Kontakt-Mail die Anfrage-Felder aus und
 * schätzt, ob es Spam ist. Nutzt die KI, wenn aktiv; sonst eine sichere
 * Heuristik (die NICHTS als Spam markiert, damit nichts fälschlich verschwindet).
 * Der Kunde steht zu diesem Zeitpunkt bereits über den Token fest – die KI
 * beeinflusst die Zuordnung NICHT.
 */
export async function parseInquiryEmail(
  subject: string,
  body: string,
): Promise<ParsedInquiry> {
  if (!isAiEnabled()) return heuristicParse(subject, body);

  const result = await completeText({
    system:
      'Du wertest eingehende E-Mails aus, die über Kontaktformulare/Funnels einer Marketing-Agentur kommen. ' +
      'Ziehe die Kontaktdaten der anfragenden Person heraus und schätze, ob es sich um eine echte Anfrage oder um Spam/Werbung/Automatik handelt. ' +
      'Antworte AUSSCHLIESSLICH mit JSON in genau diesem Schema: ' +
      '{"is_spam": boolean, "spam_reason": string|null, "name": string|null, "email": string|null, "phone": string|null, "subject": string|null, "message": string|null}. ' +
      'is_spam=true nur bei eindeutigem Spam/Werbung/Newsletter/Auto-Reply. Bei echter Kundenanfrage is_spam=false. Keine Erklärungen außerhalb des JSON.',
    prompt: `Betreff: ${subject}\n\nInhalt:\n${body.slice(0, 8000)}`,
    maxTokens: 500,
  });

  if (!result) return heuristicParse(subject, body);

  try {
    const p = JSON.parse(extractJson(result.text)) as Record<string, unknown>;
    return {
      isSpam: p.is_spam === true,
      spamReason: str(p.spam_reason),
      name: str(p.name),
      email: str(p.email),
      phone: str(p.phone),
      subject: str(p.subject) ?? (subject || null),
      message: str(p.message) ?? (body.trim() ? body.trim().slice(0, 4000) : null),
    };
  } catch {
    return heuristicParse(subject, body);
  }
}
