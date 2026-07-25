import 'server-only';
import { completeText } from '@/lib/ai/complete';
import type { RecapContext } from './context';

const SYSTEM = `Du schreibst im Namen einer deutschen Marketing-Agentur einen freundlichen, professionellen Wochenrückblick an einen Kunden.

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{ "text": "der fertige Rückblick als zusammenhängender Text" }

Regeln:
- Deutsch, Sie-Form, wertschätzend und konkret. 4-10 Sätze.
- Nenne, was diese Woche erledigt wurde, und was laufend/als Nächstes ansteht.
- Wenn nichts abgeschlossen wurde, aber laufende Aufgaben existieren: den Fortschritt/Status ehrlich und positiv darstellen (die Betreuung läuft weiter).
- Nichts erfinden. Nur die gelieferten Punkte nutzen. Keine internen Details.
- Beginne mit einer kurzen Anrede und ende mit einem freundlichen Ausblick.`;

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s !== -1 && e > s ? t.slice(s, e + 1) : t;
}

/** Writes a client-facing weekly recap. null when AI is off or fails. */
export async function generateRecap(ctx: RecapContext): Promise<string | null> {
  const lines = [
    `Kunde: ${ctx.companyName}`,
    `Zeitraum: ${ctx.weekFrom} bis ${ctx.today}`,
    '',
    'Diese Woche abgeschlossen:',
    ...(ctx.completed.length ? ctx.completed.map((t) => `- ${t}`) : ['- (nichts abgeschlossen)']),
    '',
    'Laufend / als Nächstes:',
    ...(ctx.ongoing.length ? ctx.ongoing.map((t) => `- ${t}`) : ['- (nichts offen)']),
  ];
  const result = await completeText({
    system: SYSTEM,
    prompt: lines.join('\n'),
    maxTokens: 900,
  });
  if (!result) return null;
  try {
    const parsed = JSON.parse(extractJson(result.text)) as { text?: unknown };
    return typeof parsed.text === 'string' && parsed.text.trim()
      ? parsed.text.trim()
      : null;
  } catch {
    // If the model returned plain text despite instructions, use it as-is.
    return result.text.trim() || null;
  }
}
