import 'server-only';
import { completeText } from '@/lib/ai/complete';
import type { RecapContext } from './context';

const SYSTEM = `Du schreibst im Namen einer deutschen Marketing-Agentur den INHALT eines Wochenrückblicks an einen Kunden.

Antworte AUSSCHLIESSLICH mit JSON (kein Markdown, keine Code-Fences):
{ "text": "der Rückblick-INHALT als zusammenhängender Text" }

Regeln:
- Deutsch, Sie-Form, wertschätzend und konkret. Ruhig ausführlich (mehrere Absätze), wenn genügend Informationen vorliegen.
- Nutze die Details aus den Aufgaben (inkl. Beschreibungen) – z. B. SEO-/Ranking-, SEA-/Kampagnen- oder sonstige Angaben – und fasse sie verständlich und konkret zusammen.
- Nenne, was diese Woche erledigt wurde, und was laufend/als Nächstes ansteht. Gliedere bei Bedarf in kurze Absätze.
- Wenn nichts abgeschlossen wurde, aber laufende Aufgaben existieren: den Fortschritt/Status ehrlich und positiv darstellen (die Betreuung läuft weiter).
- Nichts erfinden. Nur die gelieferten Punkte nutzen. Keine internen Details.
- WICHTIG: KEINE Anrede und KEINE Grußformel schreiben – nur den reinen Inhalt. Einstieg und Grußformel werden separat ergänzt.`;

const OPENER = 'Hallo, anbei euer Wochenrückblick';
const CLOSING = 'Mit besten Grüßen\nsupevo Team';

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

  let inner: string | null;
  try {
    const parsed = JSON.parse(extractJson(result.text)) as { text?: unknown };
    inner =
      typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : null;
  } catch {
    // If the model returned plain text despite instructions, use it as-is.
    inner = result.text.trim() || null;
  }
  if (!inner) return null;

  // Wrap with the fixed opener + signature so the client always gets the same
  // greeting/close, regardless of what the model wrote.
  return `${OPENER}\n\n${inner}\n\n${CLOSING}`;
}
