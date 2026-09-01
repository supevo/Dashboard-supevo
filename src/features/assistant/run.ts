import 'server-only';
import { logger } from '@/lib/logger';
import { assistantTools, executeAssistantTool } from './tools';

const MODEL = process.env.AI_MODEL?.trim() || 'gpt-5.4';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  /**
   * Optional screenshot/photo attached to a USER message, as a data URL
   * (e.g. "data:image/jpeg;base64,…"). Only honored on the most recent user
   * message (older images are dropped to bound vision-token cost); by then the
   * assistant's textual proposal already carries the extracted details.
   */
  image?: string;
}

const SYSTEM = `Du bist der interne Assistent des supevo-Dashboards (Agentur-Software).
Du hilfst dem Team, Daten im System anzulegen und zu ändern.

Arbeitsweise:
- Sprich Deutsch, kurz und konkret.
- Löse Namen IMMER zuerst über die find_*-Werkzeuge in IDs auf ("Kunde XY" → find_client,
  Mitarbeiter → find_team_member, Projekt → list_client_projects, Aufgabe → find_task).
- Erfinde niemals IDs.
- Gibt eine Suche mehrere oder keine Treffer, frage kurz zurück, statt zu raten.
- Führe die gewünschte Änderung dann mit dem passenden Werkzeug aus und fasse am Ende in
  einem Satz zusammen, was du getan hast (oder warum nicht).
- Ein Werkzeug meldet Fehler als "Fehler: ..." – gib den Grund verständlich weiter.
- Du handelst mit den Rechten des angemeldeten Nutzers; was er nicht darf, kannst auch du nicht.

Bilder/Screenshots (z. B. WhatsApp-Verlauf):
- Enthält eine Nachricht ein Bild, lies den Text sorgfältig heraus (OCR) und erkenne die
  gewünschte Aufgabe sowie – falls genannt – den Kunden und ein passendes Projekt.
- Lege bei einem Screenshot NIEMALS sofort etwas an. Zeige zuerst einen kompakten Vorschlag:
  Titel, optionale Beschreibung, erkannter Kunde und Zielprojekt. Löse Kunde/Projekt schon per
  find_client / list_client_projects auf, damit du weißt, ob es sie gibt.
- Ist der Kunde oder das Projekt unklar oder mehrdeutig, frage kurz nach – rate nicht.
- Rufe create_task ERST auf, nachdem der Nutzer den Vorschlag ausdrücklich bestätigt hat
  (z. B. „ok", „passt", „ja, anlegen").`;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Runs the OpenAI tool-calling loop until the model produces a final answer.
 * Tools execute the app's existing server actions, so authorization/RLS apply.
 */
export async function runAssistant(history: ChatMsg[]): Promise<{ reply: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { reply: 'Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).' };

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  // Heutiges Datum (Europe/Berlin) für relative Zeitangaben wie „morgen".
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(new Date());

  const recent = history.slice(-20);
  // Keep an attached image only on the LAST user message (cost control); by the
  // confirmation turn the earlier proposal text already holds the details.
  const lastUserIdx = recent.map((m) => m.role).lastIndexOf('user');
  const messages: any[] = [
    { role: 'system', content: `${SYSTEM}\n\nHeutiges Datum (Europe/Berlin): ${today}. Rechne relative Angaben (morgen, übermorgen, nächste Woche) daraus in ein konkretes Datum um.` },
    ...recent.map((m, i) => {
      if (m.role === 'user' && m.image && i === lastUserIdx) {
        // Multimodal content part so GPT can read the screenshot.
        return {
          role: 'user' as const,
          content: [
            { type: 'text', text: m.content || 'Erkenne aus diesem Screenshot die Aufgabe.' },
            { type: 'image_url', image_url: { url: m.image } },
          ],
        };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  try {
    for (let step = 0; step < 8; step++) {
      const res = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1500,
        tools: assistantTools as any,
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
          result = await executeAssistantTool(call.function?.name ?? '', args);
        } catch (e) {
          result = 'Fehler: ' + (e instanceof Error ? e.message : String(e));
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return { reply: 'Abgebrochen (zu viele Schritte). Bitte formuliere die Aufgabe konkreter.' };
  } catch (e) {
    logger.error('assistant.run_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { reply: 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut oder formuliere es anders.' };
  }
}
