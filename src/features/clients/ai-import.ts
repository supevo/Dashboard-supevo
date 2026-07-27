import 'server-only';
import sanitizeHtml from 'sanitize-html';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { logger } from '@/lib/logger';

/**
 * One client parsed by the AI from free text or a website. Every field is
 * optional/nullable: the model fills what it is confident about and lists what
 * it could not determine in `questions`, so a human reviews before saving.
 */
export interface ExtractedClient {
  name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  stage: 1 | 2 | null;
  interval_months: 1 | 3 | 12 | null;
  payment_method: 'sepa' | 'transfer' | null;
  iban: string | null;
  mandate_reference: string | null;
  mandate_date: string | null; // ISO yyyy-mm-dd
  membership_note: string | null; // free description of the "Abo" if unclear
  questions: string[]; // open points for the human to confirm
}

export interface ExtractResult {
  clients: ExtractedClient[];
  warning?: string;
}

const SYSTEM = `Du bist ein Assistent, der Kundendaten für eine Marketing-Agentur strukturiert erfasst.
Du bekommst freien Text (z. B. eingefügte Kundendaten, einen Vertrag, ein SEPA-Mandat oder den Text einer Website).
Extrahiere daraus einen oder mehrere Kunden. Erfinde nichts. Wenn du dir bei einem Feld unsicher bist oder es fehlt, lass es null und trage eine kurze Rückfrage in "questions" ein.

Antworte ausschließlich als JSON in exakt dieser Form:
{
  "clients": [
    {
      "name": string|null,               // Firmenname des Kunden
      "contact_name": string|null,       // Ansprechpartner (Person)
      "contact_email": string|null,
      "phone": string|null,
      "website": string|null,
      "address_line1": string|null,      // Straße + Nr.
      "address_line2": string|null,
      "postal_code": string|null,
      "city": string|null,
      "country": string|null,
      "stage": 1|2|null,                 // Mitgliedschaftsstufe, falls erkennbar
      "interval_months": 1|3|12|null,    // Abrechnungsintervall in Monaten
      "payment_method": "sepa"|"transfer"|null,
      "iban": string|null,
      "mandate_reference": string|null,  // SEPA-Mandatsreferenz
      "mandate_date": string|null,       // Datum des Mandats als YYYY-MM-DD
      "membership_note": string|null,    // freie Beschreibung des Abos, wenn Stufe unklar
      "questions": string[]              // offene Punkte / Rückfragen auf Deutsch
    }
  ]
}
Gib nur das JSON zurück, keinen weiteren Text.`;

const clientDefaults: ExtractedClient = {
  name: null,
  contact_name: null,
  contact_email: null,
  phone: null,
  website: null,
  address_line1: null,
  address_line2: null,
  postal_code: null,
  city: null,
  country: null,
  stage: null,
  interval_months: null,
  payment_method: null,
  iban: null,
  mandate_reference: null,
  mandate_date: null,
  membership_note: null,
  questions: [],
};

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function normalizeClient(raw: unknown): ExtractedClient {
  const o = (raw ?? {}) as Record<string, unknown>;
  const stage = o.stage === 1 || o.stage === 2 ? o.stage : null;
  const interval =
    o.interval_months === 1 || o.interval_months === 3 || o.interval_months === 12
      ? o.interval_months
      : null;
  const payment =
    o.payment_method === 'sepa' || o.payment_method === 'transfer'
      ? o.payment_method
      : null;
  const questions = Array.isArray(o.questions)
    ? o.questions.map((q) => str(q)).filter((q): q is string => !!q)
    : [];
  return {
    ...clientDefaults,
    name: str(o.name),
    contact_name: str(o.contact_name),
    contact_email: str(o.contact_email),
    phone: str(o.phone),
    website: str(o.website),
    address_line1: str(o.address_line1),
    address_line2: str(o.address_line2),
    postal_code: str(o.postal_code),
    city: str(o.city),
    country: str(o.country),
    stage,
    interval_months: interval,
    payment_method: payment,
    iban: str(o.iban)?.replace(/\s+/g, '') ?? null,
    mandate_reference: str(o.mandate_reference),
    mandate_date: str(o.mandate_date),
    membership_note: str(o.membership_note),
    questions,
  };
}

/** Fetches a URL and reduces it to plain text (tags stripped, capped). */
export async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SupevoDashboard/1.0 (+client-import)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = sanitizeHtml(html, {
      allowedTags: [],
      allowedAttributes: {},
      nonTextTags: ['script', 'style', 'noscript', 'nav', 'svg'],
    })
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 12_000);
  } catch (e) {
    logger.warn('client-import.fetch.failed', { error: (e as Error).message });
    return null;
  }
}

/**
 * Extracts one or more clients from free text via the AI. Returns an empty list
 * (with a warning) when AI is disabled or the response can't be parsed.
 */
export async function extractClients(text: string): Promise<ExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) return { clients: [], warning: 'Kein Text zum Auswerten.' };
  if (!isAiEnabled()) {
    return { clients: [], warning: 'KI ist nicht konfiguriert.' };
  }

  const ai = await completeText({
    system: SYSTEM,
    prompt: `Hier sind die Rohdaten:\n\n${trimmed.slice(0, 16_000)}`,
    maxTokens: 2048,
  });
  if (!ai?.text) {
    return { clients: [], warning: 'Die KI hat keine Antwort geliefert.' };
  }

  try {
    const match = ai.text.match(/\{[\s\S]*\}/);
    if (!match) return { clients: [], warning: 'Antwort konnte nicht gelesen werden.' };
    const parsed = JSON.parse(match[0]) as { clients?: unknown };
    const list = Array.isArray(parsed.clients) ? parsed.clients : [];
    const clients = list
      .map(normalizeClient)
      // Drop entirely empty entries.
      .filter((c) => c.name || c.contact_email || c.contact_name);
    if (clients.length === 0) {
      return { clients: [], warning: 'Es konnten keine Kundendaten erkannt werden.' };
    }
    return { clients };
  } catch (e) {
    logger.warn('client-import.parse.failed', { error: (e as Error).message });
    return { clients: [], warning: 'Antwort konnte nicht verarbeitet werden.' };
  }
}
