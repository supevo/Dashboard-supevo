import 'server-only';
import { completeText, isAiEnabled } from '@/lib/ai/complete';

/**
 * German keywords that strongly indicate a physical print product. Used as a
 * fast, offline heuristic and as a safety net when the AI is unavailable.
 */
const PRINT_KEYWORDS = [
  'druck',
  'drucken',
  'drucksache',
  'gedruckt',
  'flyer',
  'visitenkarte',
  'broschüre',
  'broschuere',
  'prospekt',
  'katalog',
  'plakat',
  'poster',
  'banner',
  'roll-up',
  'rollup',
  'aufkleber',
  'sticker',
  'etikett',
  'aufsteller',
  'schild',
  'beschilderung',
  'folie',
  'beschriftung',
  'briefpapier',
  'briefbogen',
  'briefumschlag',
  'kuvert',
  'mappe',
  'einladung',
  'postkarte',
  'karte drucken',
  'speisekarte',
  'menükarte',
  'menuekarte',
  'fahne',
  'messewand',
  'textildruck',
  'tasse',
  'kalender drucken',
  'print',
];

function matchesKeyword(text: string): boolean {
  const t = text.toLowerCase();
  return PRINT_KEYWORDS.some((k) => t.includes(k));
}

const AI_SYSTEM = `Du entscheidest, ob eine Agentur-Aufgabe die Produktion eines PHYSISCHEN Druckprodukts umfasst
(z. B. Flyer, Visitenkarten, Broschüre, Plakat, Banner, Aufkleber, Schilder, gedruckte Karten).
Reine Digital-/Onlinearbeit (Website, Social Media, Logo-Design ohne Druck, Newsletter) zählt NICHT.
Antworte AUSSCHLIESSLICH mit JSON: { "print": true } oder { "print": false }.`;

/**
 * Decides whether a task involves producing a physical print product, from its
 * title + description. Uses the AI when configured (more accurate), otherwise a
 * keyword heuristic. On any AI error it falls back to the heuristic, so the
 * decision is always deterministic and safe.
 */
export async function detectPrintProduct(
  title: string,
  description: string | null,
): Promise<boolean> {
  const text = `${title}\n${description ?? ''}`.trim();
  if (!text) return false;

  if (isAiEnabled()) {
    try {
      // Bound the AI call so a slow/hanging provider can't delay the task move
      // that triggers this detection. On timeout we fall back to the heuristic.
      const res = await Promise.race([
        completeText({ system: AI_SYSTEM, prompt: text.slice(0, 4000), maxTokens: 20 }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);
      if (res) {
        const m = res.text.match(/"print"\s*:\s*(true|false)/i);
        if (m) return m[1]!.toLowerCase() === 'true';
      }
    } catch {
      /* fall through to heuristic */
    }
  }

  return matchesKeyword(text);
}
