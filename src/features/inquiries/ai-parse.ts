import 'server-only';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import {
  INQUIRY_CATEGORIES,
  normalizeCategory,
  type InquiryCategory,
} from '@/features/inquiries/categories';

export interface InquiryClassification {
  /** Gewerk-Kategorie (Badge) oder null, wenn KI aus / nicht bestimmbar. */
  category: InquiryCategory | null;
  /** Dringlichkeit 1–10 („zeitnah umsetzen?") oder null. */
  urgency: number | null;
  /** Auftragspotenzial 1–10 (Projektgröße/Wert) oder null. */
  potential: number | null;
}

function clamp1to10(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/**
 * Ordnet eine Anfrage einer Gewerk-Kategorie zu und schätzt Dringlichkeit und
 * Auftragspotenzial direkt aus dem Text (1–10). Rein additiv – ändert die
 * Kunden-/Spam-Zuordnung nicht. Gibt neutrale Nullwerte zurück, wenn keine KI
 * aktiv ist oder der Aufruf scheitert.
 */
export async function classifyInquiry(
  subject: string | null,
  message: string | null,
): Promise<InquiryClassification> {
  const empty: InquiryClassification = { category: null, urgency: null, potential: null };
  if (!isAiEnabled()) return empty;
  const text = `${subject ?? ''}\n${message ?? ''}`.trim();
  if (!text) return empty;

  const result = await completeText({
    system:
      'Du kategorisierst eingehende Endkunden-Anfragen eines Handwerks-/SHK-Betriebs und schätzt zwei Kennzahlen. ' +
      `Wähle GENAU EINE Kategorie aus dieser Liste: ${INQUIRY_CATEGORIES.join(', ')}. ` +
      'Passt nichts eindeutig, nimm "sonstiges". ' +
      'urgency = wie zeitnah die Person umsetzen will (1=unklar/langfristig, 10=sehr dringend). ' +
      'potential = geschätztes Auftragspotenzial/Projektgröße (1=klein, 10=sehr groß). ' +
      'Antworte AUSSCHLIESSLICH mit JSON: {"category": string, "urgency": number, "potential": number}. Keine Erklärungen.',
    prompt: text.slice(0, 6000),
    maxTokens: 120,
  });
  if (!result) return empty;

  try {
    const s = result.text.indexOf('{');
    const e = result.text.lastIndexOf('}');
    const p = JSON.parse(
      s !== -1 && e > s ? result.text.slice(s, e + 1) : result.text,
    ) as Record<string, unknown>;
    return {
      category: normalizeCategory(p.category),
      urgency: clamp1to10(p.urgency),
      potential: clamp1to10(p.potential),
    };
  } catch {
    return empty;
  }
}

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
