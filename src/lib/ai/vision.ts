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

function visionModel(): string {
  return process.env.AI_VISION_MODEL?.trim() || 'gpt-4o-mini';
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

    const params = {
      model: visionModel(),
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
        format: {
          type: 'json_schema',
          name: 'beleg',
          strict: true,
          schema: SCHEMA,
        },
      },
    } as unknown as Parameters<typeof client.responses.create>[0];

    const res = await client.responses.create(params);
    const text = (res as { output_text?: string }).output_text;
    if (!text) return null;
    return JSON.parse(text) as ReceiptExtraction;
  } catch (e) {
    logger.warn('vision.extract_failed', { error: (e as Error).message });
    return null;
  }
}
