import 'server-only';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { PW_CATEGORIES, isPwCategory, type PwCategory } from '@/features/passwords/shared';

/** Keyword fallback when the AI is off (or fails). */
function heuristicCategory(title: string): PwCategory {
  const t = title.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has('instagram', 'facebook', 'meta', 'tiktok', 'linkedin', 'youtube', 'twitter', ' x ', 'pinterest', 'snapchat'))
    return 'Social Media';
  if (has('google ads', 'meta ads', 'ads', 'werbe', 'adwords', 'kampagne'))
    return 'Werbekonten (Ads)';
  if (has('ionos', 'hetzner', 'strato', 'domain', 'hosting', 'server', 'wordpress', 'ftp', 'cpanel', 'vercel', 'netlify', 'dns'))
    return 'Website & Hosting';
  if (has('mail', 'gmail', 'outlook', 'imap', 'smtp', 'postfach'))
    return 'E-Mail';
  if (has('paypal', 'stripe', 'klarna', 'bank', 'sepa', 'iban', 'kreditkarte', 'visa', 'mastercard'))
    return 'Zahlung & Banking';
  if (has('canva', 'figma', 'adobe', 'photoshop', 'capcut', 'notion', 'slack', 'trello', 'tool'))
    return 'Design & Tools';
  if (has('kunde', 'client', 'zugang'))
    return 'Kunden-Zugänge';
  return 'Sonstiges';
}

const SYSTEM = `Du ordnest Passwort-Einträge einer Kategorie zu – nur anhand des Titels.
Erlaubte Kategorien (exakt so schreiben): ${PW_CATEGORIES.join(' | ')}.
Antworte AUSSCHLIESSLICH mit JSON: { "map": { "<Titel>": "<Kategorie>" } }.
Jeder gelieferte Titel muss genau einmal vorkommen. Keine anderen Kategorien erfinden.`;

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/**
 * Assigns a category to each title. Uses the AI when available (batched, one
 * call), otherwise a keyword heuristic. Always returns a category per title.
 */
export async function categorizeTitles(
  titles: string[],
): Promise<Map<string, PwCategory>> {
  const out = new Map<string, PwCategory>();
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return out;

  if (isAiEnabled()) {
    const res = await completeText({
      system: SYSTEM,
      prompt: unique.map((t) => `- ${t}`).join('\n'),
      maxTokens: 1500,
    });
    if (res) {
      try {
        const parsed = JSON.parse(extractJson(res.text)) as { map?: Record<string, unknown> };
        for (const [title, cat] of Object.entries(parsed.map ?? {})) {
          if (typeof cat === 'string' && isPwCategory(cat)) {
            out.set(title, cat);
          }
        }
      } catch {
        // fall through to heuristic for any missing titles
      }
    }
  }

  for (const t of unique) {
    if (!out.has(t)) out.set(t, heuristicCategory(t));
  }
  return out;
}

/** Single-title convenience wrapper. */
export async function categorizeTitle(title: string): Promise<PwCategory> {
  const map = await categorizeTitles([title]);
  return map.get(title.trim()) ?? 'Sonstiges';
}
