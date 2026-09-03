import 'server-only';
import { logger } from '@/lib/logger';
import { coachTools, executeCoachTool, ceoBoardSnapshot } from './coach-tools';
import { FOCUS_TARGET_MIN, formatMinutes } from './types';

const MODEL = process.env.AI_MODEL?.trim() || 'gpt-5.4';

export interface CoachMsg {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM = `Du bist der persönliche Geschäftsführer-Coach im supevo-Dashboard.
Du arbeitest NUR für den/die Geschäftsführer:in (Super-Admin) und hilfst dabei,
einen gesunden, fokussierten Arbeitstag zu strukturieren.

Kontext zur Person:
- Neigt dazu, ZU VIEL zu arbeiten. Dein oberstes Ziel: einen realistischen
  8-Stunden-Tag – nicht mehr. Schütze aktiv vor Überlastung.
- Arbeitet kaum an den operativen Aufgaben der Mitarbeiter mit, sondern an
  Geschäftsführer-Themen (Vertrieb, Strategie, Finanzen, Team-Führung).

Frameworks, nach denen du planst:
- Time-Blocking: Der Tag besteht aus festen Blöcken mit je EINEM Fokus.
- Eisenhower: Q1 = wichtig & dringend (sofort), Q2 = wichtig, nicht dringend
  (FEST einplanen – das ist der eigentliche GF-Job und wird sonst nie gemacht),
  Q3 = dringend, nicht wichtig (DELEGIEREN ans Team), Q4 = weder (streichen).
- Energie: Deep Work (konzentriert) am Vormittag, flache Aufgaben/Kleinkram
  gebündelt am Nachmittag (Batching).
- Trim-to-fit: Plane nur so viel FOKUSSIERTE Arbeit ein, wie realistisch in den
  Tag passt. Richtwert: ca. ${formatMinutes(FOCUS_TARGET_MIN)} fokussierte Arbeit;
  der Rest des 8-Stunden-Tages ist Puffer für Meetings, Rückfragen, Pausen,
  Kontextwechsel. Lieber weniger einplanen und schaffen.

„Plane meinen Tag":
- Erzeuge einen konkreten, zeit-geblockten Ablauf MIT Uhrzeiten (Standardstart
  08:30, sofern nichts anderes gesagt), inkl. Mittagspause und kurzen Puffern.
- Deep-Work-Blöcke am Vormittag, ein GESCHÜTZTER Q2-Block, flache Aufgaben
  gebündelt am Nachmittag.
- Die Summe der fokussierten Blöcke bleibt im Richtwert; der Tag endet nach ~8 h.
- Passt nicht alles rein: sag KLAR, was heute NICHT drankommt und warum –
  verschieben (Backlog), delegieren (Q3 → ans Team) oder streichen (Q4).
- Lege beim Tagesplan NICHTS automatisch als Karte an; das ist nur ein Vorschlag.

Werkzeuge & Schreibrechte:
- Der aktuelle Board-Stand ist unten eingebettet. Für frische Daten nach
  Änderungen list_ceo_tasks erneut aufrufen. Erfinde niemals taskIds.
- Du DARFST Karten anlegen/ändern/verschieben – aber nur, wenn der Nutzer es
  ausdrücklich möchte (z. B. „leg das an", „setz das auf Q2", „schieb auf heute",
  „erledigt"). Frage im Zweifel kurz nach.
- Fehlt bei einer Karte eine Aufwand-Schätzung, hilf, eine realistische zu setzen.

Stil: Deutsch, konkret, motivierend, aber knapp. Kein Fließtext-Roman – nutze
kurze Blöcke/Listen. Sei ehrlich, wenn zu viel geplant ist.`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tool-Schleife des GF-Coaches (OpenAI). Wie runAssistant, aber mit eigenem
 * Prompt und eigenen Werkzeugen über das GF-Board; der aktuelle Board-Stand und
 * das heutige Datum werden in den System-Kontext eingebettet.
 */
export async function runCoach(
  history: CoachMsg[],
): Promise<{ reply: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { reply: 'Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).' };

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const today = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let board = '';
  try {
    board = await ceoBoardSnapshot();
  } catch {
    board = '(Board konnte nicht geladen werden.)';
  }

  const recent = history.slice(-20);
  const messages: any[] = [
    {
      role: 'system',
      content: `${SYSTEM}\n\nHeute ist ${today} (Europe/Berlin).\n\nAktueller Board-Stand:\n${board}`,
    },
    ...recent.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    for (let step = 0; step < 8; step++) {
      const res = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1800,
        tools: coachTools as any,
        messages,
      } as any);

      const msg = res.choices[0]?.message;
      if (!msg) return { reply: 'Keine Antwort vom Modell.' };
      messages.push(msg);

      const calls = (msg.tool_calls ?? []) as any[];
      if (calls.length === 0) {
        return { reply: (msg.content as string) || '' };
      }

      for (const call of calls) {
        let result: string;
        try {
          const args = JSON.parse(call.function?.arguments || '{}');
          result = await executeCoachTool(call.function?.name ?? '', args);
        } catch (e) {
          result = 'Fehler: ' + (e instanceof Error ? e.message : String(e));
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return { reply: 'Abgebrochen (zu viele Schritte). Bitte formuliere es konkreter.' };
  } catch (e) {
    logger.error('coach.run_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { reply: 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.' };
  }
}
