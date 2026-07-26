import 'server-only';
import { completeText } from '@/lib/ai/complete';

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/** KI estimate of the effort for a task, in minutes. null if AI is off/fails. */
export async function estimateTaskMinutes(
  title: string,
  description: string | null,
): Promise<number | null> {
  const result = await completeText({
    system: `Du schaetzt den Arbeitsaufwand fuer eine Aufgabe einer Marketing-Agentur.
Gib eine realistische Schaetzung in MINUTEN (reine Arbeitszeit, ohne Wartezeiten).
Antworte AUSSCHLIESSLICH mit JSON: {"minutes": <ganze Zahl>}. Zwischen 15 und 4800.`,
    prompt: `Titel: ${title}\n${description ? `Beschreibung: ${description}` : ''}`,
    maxTokens: 60,
  });
  if (!result) return null;
  try {
    const parsed = JSON.parse(extractJson(result.text)) as { minutes?: unknown };
    const m = Number(parsed.minutes);
    if (!Number.isFinite(m)) return null;
    return Math.min(4800, Math.max(15, Math.round(m)));
  } catch {
    return null;
  }
}
