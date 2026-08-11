import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Belege per KI auslesen (OpenAI Vision, Responses-API mit structured output).
 * Bilder werden als input_image, PDFs als input_file direkt übergeben – kein
 * eigenes PDF→PNG-Rendering nötig. Nur OpenAI (Vision); ohne OPENAI_API_KEY ist
 * isReceiptVisionEnabled() false und der Aufrufer nutzt den OCR/Regel-Fallback.
 */

export interface ReceiptExtractionContext {
  /** Eigene Firma – damit die KI Absender/Empfänger und Richtung bestimmt. */
  firmaName: string | null;
  firmaUstId: string | null;
  firmaIban: string | null;
  /** Erlaubte Kategorien (id + Bezeichnung) zur Auswahl. */
  kategorien: { id: string; label: string; art: string }[];
}

export interface ReceiptExtraction {
  haendler: string | null;
  richtung: 'eingang' | 'ausgang' | null;
  datum: string | null;
  faellig: string | null;
  brutto: number | null;
  ust_satz: number | null;
  ust_betrag: number | null;
  netto: number | null;
  rechnungsnummer: string | null;
  ust_idnr: string | null;
  iban: string | null;
  kategorie_id: string | null;
  konfidenz: number | null;
  begruendung: string | null;
}

export function isReceiptVisionEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface AiBankTransaction {
  datum: string | null;
  gegen: string | null;
  zweck: string | null;
  betrag: number | null; // euros, negative = Ausgang
}
export interface AiBankStatement {
  account_iban: string | null;
  transactions: AiBankTransaction[];
}

const BANK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    account_iban: { type: ['string', 'null'] },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          datum: { type: ['string', 'null'] },
          gegen: { type: ['string', 'null'] },
          zweck: { type: ['string', 'null'] },
          betrag: { type: ['number', 'null'] },
        },
        required: ['datum', 'gegen', 'zweck', 'betrag'],
      },
    },
  },
  required: ['account_iban', 'transactions'],
} as const;

const BANK_SYSTEM = [
  'Du liest deutsche Bankkontoauszüge (CSV, MT940, CAMT.053 oder PDF) und gibst',
  'JEDE einzelne Buchung strukturiert zurück. datum als YYYY-MM-DD. betrag als',
  'Zahl in Euro (Punkt als Dezimaltrennzeichen): positiv = Geldeingang, negativ =',
  'Geldausgang. gegen = Name der Gegenpartei (Empfänger/Zahler), zweck =',
  'Verwendungszweck. account_iban = IBAN des Auszug-Kontos, falls erkennbar,',
  'sonst null. WICHTIG: Gib ausnahmslos ALLE Umsätze zurück, fasse nichts',
  'zusammen, lasse keine Zeile aus und erfinde keine. Zwei Buchungen mit',
  'gleichem Betrag/Datum sind zwei getrennte Einträge. Gib aber JEDE Buchung',
  'GENAU EINMAL zurück – niemals dieselbe Zeile doppelt (einmal mit und einmal',
  'ohne Namen). Wenn ein Name erkennbar ist, setze ihn direkt in gegen.',
].join(' ');

/**
 * KI-Fallback für Kontoauszüge: liest jede Buchung, wenn die deterministischen
 * Parser nichts finden (fummelige MT940/PDF). Text-Auszüge gehen als input_text,
 * PDFs als input_file. Nur OpenAI; ohne Key null. Wirft nie.
 */
export async function extractBankStatement(input: {
  text?: string;
  pdfBytes?: Buffer;
}): Promise<AiBankStatement | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const userContent: unknown[] = [
      { type: 'input_text', text: 'Lies alle Umsätze aus diesem Kontoauszug.' },
    ];
    if (input.pdfBytes) {
      userContent.push({
        type: 'input_file',
        filename: 'auszug.pdf',
        file_data: `data:application/pdf;base64,${input.pdfBytes.toString('base64')}`,
      });
    } else if (input.text) {
      // Guard against pathologically large inputs.
      userContent.push({ type: 'input_text', text: input.text.slice(0, 120_000) });
    } else {
      return null;
    }

    const params = {
      model: visionModel(),
      // High cap so long statements (many bookings) are never truncated.
      max_output_tokens: 32000,
      input: [
        { role: 'system', content: BANK_SYSTEM },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'kontoauszug',
          strict: true,
          schema: BANK_SCHEMA,
        },
      },
    } as unknown as Parameters<typeof client.responses.create>[0];

    const res = await client.responses.create(params);
    const text = (res as { output_text?: string }).output_text;
    if (!text) return null;
    return JSON.parse(text) as AiBankStatement;
  } catch (e) {
    logger.warn('vision.bank_extract_failed', { error: (e as Error).message });
    return null;
  }
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

/**
 * Resolves a usable MIME type for a receipt. Prefers a concrete image/* or PDF
 * type; otherwise (empty, octet-stream, or a non-file type from OneDrive) derives
 * it from the file extension so JPG/PNG/PDF are read even without a clean MIME.
 */
export function resolveReceiptMime(
  fileName: string | null,
  mime: string | null,
): string {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf' || (m.startsWith('image/') && m !== 'image/*')) {
    return m;
  }
  const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
  return EXT_MIME[ext] ?? (m || 'application/octet-stream');
}

/** True if the resolved MIME is something Vision can read (image or PDF). */
export function isReadableReceiptMime(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/');
}

function visionModel(): string {
  // Standard-Vision-Modell fürs Beleg-Auslesen. Bewusst das Mini-Modell:
  // Belege/Auszüge auslesen ist ein Massen-Job (jede PDF-Seite kostet als Bild
  // viele Tokens), und gpt-5.4-mini läuft im großen Tages-Kontingent (2,5 Mio
  // Tokens) statt im knappen Premium-Kontingent (250k). Per AI_VISION_MODEL
  // überschreibbar.
  return process.env.AI_VISION_MODEL?.trim() || 'gpt-5.4-mini';
}

/** GPT-5- und o-Serie sind Reasoning-Modelle (nehmen reasoning/verbosity). */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[0-9])/i.test(model);
}

/**
 * Reasoning-Zusatz für die Responses-API. Belege-Auslesen ist reine
 * OCR-Extraktion – niedriger Reasoning-Aufwand hält die Aufrufe schnell (sonst
 * „denkt" das Modell zu lange und läuft ins Timeout → Lesefehler). Bei
 * Nicht-Reasoning-Modellen bleibt das Objekt leer.
 */
function reasoningParams(model: string): Record<string, unknown> {
  return isReasoningModel(model) ? { reasoning: { effort: 'low' } } : {};
}

/** Kurze Ausgaben für Reasoning-Modelle (nur strukturiertes JSON nötig). */
function verbosityFor(model: string): { verbosity: 'low' } | Record<string, never> {
  return isReasoningModel(model) ? { verbosity: 'low' } : {};
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    haendler: { type: ['string', 'null'] },
    richtung: { type: ['string', 'null'], enum: ['eingang', 'ausgang', null] },
    datum: { type: ['string', 'null'] },
    faellig: { type: ['string', 'null'] },
    brutto: { type: ['number', 'null'] },
    ust_satz: { type: ['number', 'null'] },
    ust_betrag: { type: ['number', 'null'] },
    netto: { type: ['number', 'null'] },
    rechnungsnummer: { type: ['string', 'null'] },
    ust_idnr: { type: ['string', 'null'] },
    iban: { type: ['string', 'null'] },
    kategorie_id: { type: ['string', 'null'] },
    konfidenz: { type: ['number', 'null'] },
    begruendung: { type: ['string', 'null'] },
  },
  required: [
    'haendler', 'richtung', 'datum', 'faellig', 'brutto', 'ust_satz',
    'ust_betrag', 'netto', 'rechnungsnummer', 'ust_idnr', 'iban',
    'kategorie_id', 'konfidenz', 'begruendung',
  ],
} as const;

function systemPrompt(ctx: ReceiptExtractionContext): string {
  const kats = ctx.kategorien
    .map((k) => `- ${k.id} (${k.label}, ${k.art})`)
    .join('\n');
  return [
    'Du liest deutsche Belege/Rechnungen und gibst die Felder strukturiert zurück.',
    'Eigene Firma (nie als Händler ausgeben):',
    `- Name: ${ctx.firmaName ?? 'unbekannt'}`,
    `- USt-IdNr.: ${ctx.firmaUstId ?? 'unbekannt'}`,
    `- IBAN: ${ctx.firmaIban ?? 'unbekannt'}`,
    'richtung: "ausgang" wenn die eigene Firma der Rechnungssteller/Absender ist',
    '(Ausgangsrechnung), sonst "eingang". Bestimme das über eigene IBAN/USt-IdNr.',
    'haendler = die Gegenpartei (nie die eigene Firma).',
    'datum/faellig im Format YYYY-MM-DD. Beträge als Zahl in Euro (Punkt als',
    'Dezimaltrennzeichen). ust_satz ist 19, 7 oder 0.',
    'kategorie_id MUSS aus dieser Liste stammen (oder null):',
    kats,
    'konfidenz 0..1. Gib nur ab, was du wirklich erkennst; sonst null.',
  ].join('\n');
}

/**
 * Extracts a single receipt from its bytes. `mime` decides image vs PDF input.
 * Returns null on any failure (caller falls back). Never throws.
 */
export async function extractReceipt(
  bytes: Buffer,
  mime: string,
  ctx: ReceiptExtractionContext,
): Promise<ReceiptExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const b64 = bytes.toString('base64');

    const filePart =
      mime === 'application/pdf'
        ? {
            type: 'input_file',
            filename: 'beleg.pdf',
            file_data: `data:application/pdf;base64,${b64}`,
          }
        : {
            type: 'input_image',
            image_url: `data:${mime || 'image/png'};base64,${b64}`,
            detail: 'auto',
          };

    const model = visionModel();
    const params = {
      model,
      // Ausreichend Budget: bei Reasoning-Modellen zählen die Denk-Tokens mit,
      // sonst kommt die Ausgabe leer/abgeschnitten zurück (→ Lesefehler).
      max_output_tokens: 6000,
      ...reasoningParams(model),
      input: [
        { role: 'system', content: systemPrompt(ctx) },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Lies diesen Beleg aus.' },
            filePart,
          ],
        },
      ],
      text: {
        ...verbosityFor(model),
        format: {
          type: 'json_schema',
          name: 'beleg',
          strict: true,
          schema: SCHEMA,
        },
      },
    } as unknown as Parameters<typeof client.responses.create>[0];

    // Per-receipt timeout (großzügig, damit Reasoning-Modelle nicht ins Timeout
    // laufen), plus die SDK-Retries mit Backoff gegen 429/transiente Fehler.
    const res = (await client.responses.create(params, {
      timeout: 90000,
      maxRetries: 3,
    })) as {
      output_text?: string;
      status?: string;
      incomplete_details?: { reason?: string };
    };
    const text = res.output_text;
    if (!text) {
      // Kein Text → sagen WARUM (z. B. Budget aufgebraucht, Content-Filter),
      // damit „Lesefehler" nicht komplett undurchsichtig ist.
      logger.warn('vision.extract_empty', {
        model,
        status: res.status ?? 'unknown',
        reason: res.incomplete_details?.reason ?? 'no_output_text',
      });
      return null;
    }
    return JSON.parse(text) as ReceiptExtraction;
  } catch (e) {
    logger.warn('vision.extract_failed', { error: (e as Error).message });
    return null;
  }
}
